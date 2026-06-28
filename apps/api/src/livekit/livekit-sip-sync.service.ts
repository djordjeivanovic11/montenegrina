import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Environment } from '@montenegrina/config';

import { ENVIRONMENT } from '../core/tokens.js';
import { LiveKitVoiceService } from './livekit-voice.service.js';

@Injectable()
export class LiveKitSipSyncService {
  readonly #logger = new Logger(LiveKitSipSyncService.name);

  constructor(
    private readonly livekitVoice: LiveKitVoiceService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  async addInboundNumber(e164: string): Promise<void> {
    const trunkId = this.environment.LIVEKIT_SIP_INBOUND_TRUNK_ID;
    if (!trunkId) return;
    try {
      await this.livekitVoice.sipClient.updateSipInboundTrunkFields(trunkId, {
        numbers: { add: [e164] },
      } as Parameters<typeof this.livekitVoice.sipClient.updateSipInboundTrunkFields>[1]);
    } catch (error) {
      this.#logger.warn(`Failed to add ${e164} to inbound trunk: ${String(error)}`);
    }
  }

  async removeInboundNumber(e164: string): Promise<void> {
    const trunkId = this.environment.LIVEKIT_SIP_INBOUND_TRUNK_ID;
    if (!trunkId) return;
    try {
      await this.livekitVoice.sipClient.updateSipInboundTrunkFields(trunkId, {
        numbers: { remove: [e164] },
      } as Parameters<typeof this.livekitVoice.sipClient.updateSipInboundTrunkFields>[1]);
    } catch (error) {
      this.#logger.warn(`Failed to remove ${e164} from inbound trunk: ${String(error)}`);
    }
  }
}
