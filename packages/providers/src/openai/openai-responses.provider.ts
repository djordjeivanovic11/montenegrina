import {
  ProviderError,
  type LanguageModelProvider,
  type LanguageModelRequest,
  type LanguageModelResult,
  type LanguageModelStreamEvent,
  type ProviderMetadata,
  type ProviderRequestContext,
  type ProviderResult,
  type ToolCall,
} from '@montenegrina/provider-core';

import { checkedProviderFetch, providerString } from '../provider-errors.js';

export interface OpenAILanguageModelConfig {
  apiKey: string;
  model?: string;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  baseUrl?: string;
}

interface OpenAiOutputItem {
  type?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: Array<{ type?: string; text?: string }>;
}

interface OpenAiResponseBody {
  id?: string;
  model?: string;
  output_text?: string;
  output?: OpenAiOutputItem[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

function parseArguments(provider: string, value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new ProviderError({
      code: 'OPENAI_TOOL_ARGUMENTS_INVALID',
      message: 'OpenAI returned invalid tool arguments.',
      provider,
      failureClass: 'NON_RETRYABLE',
      cause: error,
    });
  }
}

function parseResult(body: OpenAiResponseBody): LanguageModelResult {
  const text =
    body.output_text ??
    body.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? '')
      .join('') ??
    '';
  const toolCalls = (body.output ?? [])
    .filter((item) => item.type === 'function_call' && item.name)
    .map((item) => ({
      id: item.call_id ?? crypto.randomUUID(),
      name: item.name ?? 'unknown',
      arguments: parseArguments('openai', item.arguments),
    }));
  return { text, toolCalls };
}

function createMetadata(
  body: OpenAiResponseBody,
  model: string,
  startedAt: number,
  requestId?: string,
): ProviderMetadata {
  return {
    provider: 'openai',
    model: body.model ?? model,
    latencyMs: Date.now() - startedAt,
    usage: {
      ...(body.usage?.input_tokens === undefined ? {} : { inputTokens: body.usage.input_tokens }),
      ...(body.usage?.output_tokens === undefined
        ? {}
        : { outputTokens: body.usage.output_tokens }),
    },
    attributes: { api: 'responses' },
    ...(requestId || body.id ? { requestId: requestId ?? body.id } : {}),
  };
}

function toOpenAiInput(request: LanguageModelRequest): Array<Record<string, unknown>> {
  return request.messages.map((message) => {
    if (message.role === 'tool') {
      if (!message.toolCallId) {
        throw new ProviderError({
          code: 'OPENAI_TOOL_CALL_ID_REQUIRED',
          message: 'Tool results require a tool call ID.',
          provider: 'openai',
          failureClass: 'NON_RETRYABLE',
        });
      }
      return { type: 'function_call_output', call_id: message.toolCallId, output: message.content };
    }
    return {
      role: message.role,
      content: [
        {
          type: message.role === 'assistant' ? 'output_text' : 'input_text',
          text: message.content,
        },
      ],
    };
  });
}

async function* readServerSentEvents(response: Response): AsyncIterable<Record<string, unknown>> {
  if (!response.body) {
    throw new ProviderError({
      code: 'OPENAI_EMPTY_STREAM',
      message: 'OpenAI returned an empty response stream.',
      provider: 'openai',
      failureClass: 'RETRYABLE',
    });
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
        if (data && data !== '[DONE]') {
          try {
            yield JSON.parse(data) as Record<string, unknown>;
          } catch (error) {
            throw new ProviderError({
              code: 'OPENAI_MALFORMED_STREAM_EVENT',
              message: 'OpenAI returned malformed streaming data.',
              provider: 'openai',
              failureClass: 'NON_RETRYABLE',
              cause: error,
            });
          }
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export class OpenAILanguageModelProvider implements LanguageModelProvider {
  readonly id = 'openai';
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #reasoningEffort: NonNullable<OpenAILanguageModelConfig['reasoningEffort']>;

  constructor(private readonly config: OpenAILanguageModelConfig) {
    this.#model = config.model ?? 'gpt-5.4';
    this.#baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    this.#reasoningEffort = config.reasoningEffort ?? 'none';
  }

  async generate(
    request: LanguageModelRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<LanguageModelResult>> {
    const startedAt = Date.now();
    const model = request.model ?? this.#model;
    const response = await checkedProviderFetch(
      this.id,
      `${this.#baseUrl}/responses`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'X-Client-Request-Id': context.requestId,
        },
        body: JSON.stringify(this.requestBody(request, model, false)),
      },
      context,
    );
    const body = (await response.json()) as OpenAiResponseBody;
    return {
      data: parseResult(body),
      metadata: createMetadata(
        body,
        model,
        startedAt,
        response.headers.get('x-request-id') ?? undefined,
      ),
    };
  }

  async *stream(
    request: LanguageModelRequest,
    context: ProviderRequestContext,
  ): AsyncIterable<LanguageModelStreamEvent> {
    const startedAt = Date.now();
    const model = request.model ?? this.#model;
    const response = await checkedProviderFetch(
      this.id,
      `${this.#baseUrl}/responses`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'X-Client-Request-Id': context.requestId,
        },
        body: JSON.stringify(this.requestBody(request, model, true)),
      },
      context,
    );

    let text = '';
    const toolCalls: ToolCall[] = [];
    let finalBody: OpenAiResponseBody = { model };
    for await (const event of readServerSentEvents(response)) {
      const type = providerString(event.type);
      if (type === 'response.output_text.delta') {
        const delta = providerString(event.delta);
        text += delta;
        yield { type: 'text.delta', delta };
      } else if (type === 'response.output_item.done') {
        const item = event.item as OpenAiOutputItem | undefined;
        if (item?.type === 'function_call' && item.name) {
          const call: ToolCall = {
            id: item.call_id ?? crypto.randomUUID(),
            name: item.name,
            arguments: parseArguments(this.id, item.arguments),
          };
          toolCalls.push(call);
          yield { type: 'tool.call', call };
        }
      } else if (type === 'response.completed') {
        finalBody = (event.response as OpenAiResponseBody | undefined) ?? finalBody;
      } else if (type === 'error') {
        throw new ProviderError({
          code: providerString(
            (event.error as { code?: unknown } | undefined)?.code,
            'OPENAI_STREAM_ERROR',
          ),
          message: 'OpenAI reported a streaming error.',
          provider: this.id,
          failureClass: 'RETRYABLE',
        });
      }
    }

    yield {
      type: 'completed',
      text,
      toolCalls,
      metadata: createMetadata(
        finalBody,
        model,
        startedAt,
        response.headers.get('x-request-id') ?? undefined,
      ),
    };
  }

  health(): Promise<{ healthy: boolean; reason?: string }> {
    return Promise.resolve(
      this.config.apiKey ? { healthy: true } : { healthy: false, reason: 'missing credential' },
    );
  }

  private requestBody(
    request: LanguageModelRequest,
    model: string,
    stream: boolean,
  ): Record<string, unknown> {
    return {
      model,
      instructions: request.system,
      input: toOpenAiInput(request),
      max_output_tokens: request.maxOutputTokens ?? 1_024,
      reasoning: { effort: this.#reasoningEffort },
      store: false,
      stream,
      tools: request.tools?.map((tool) => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        strict: true,
      })),
    };
  }
}
