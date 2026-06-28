export type ChannelType = 'BROWSER' | 'SIP' | 'TWILIO' | 'TELNYX' | 'TELECOM';
export type ChannelStatus = 'ACTIVE' | 'INACTIVE' | 'COMING_SOON';

export interface CommunicationChannel {
  type: ChannelType;
  name: string;
  status: ChannelStatus;
  configuration?: Record<string, unknown>;
}

export interface ChannelProvider {
  readonly type: ChannelType;
  isAvailable(): boolean;
  describe(): CommunicationChannel;
}

export class BrowserVoiceChannel implements ChannelProvider {
  readonly type = 'BROWSER' as const;

  isAvailable(): boolean {
    return true;
  }

  describe(): CommunicationChannel {
    return { type: this.type, name: 'Browser voice', status: 'ACTIVE' };
  }
}

export class StubPhoneChannel implements ChannelProvider {
  constructor(
    readonly type: Extract<ChannelType, 'SIP' | 'TWILIO' | 'TELNYX' | 'TELECOM'>,
    readonly name: string,
  ) {}

  isAvailable(): boolean {
    return false;
  }

  describe(): CommunicationChannel {
    return { type: this.type, name: this.name, status: 'COMING_SOON' };
  }
}

export const defaultChannelProviders: ChannelProvider[] = [
  new BrowserVoiceChannel(),
  new StubPhoneChannel('SIP', 'SIP / Phone'),
  new StubPhoneChannel('TWILIO', 'Twilio'),
  new StubPhoneChannel('TELNYX', 'Telnyx'),
  new StubPhoneChannel('TELECOM', 'Telecom provider'),
];
