import { describe, expect, it, vi } from 'vitest';

import { LiveKitSipSyncService } from '../../src/livekit/livekit-sip-sync.service.js';

describe('LiveKitSipSyncService', () => {
  it('adds E.164 numbers to the configured inbound trunk', async () => {
    const updateSipInboundTrunkFields = vi.fn().mockResolvedValue(undefined);
    const service = new LiveKitSipSyncService(
      {
        sipClient: { updateSipInboundTrunkFields },
      } as never,
      { LIVEKIT_SIP_INBOUND_TRUNK_ID: 'ST_inbound' } as never,
    );
    await service.addInboundNumber('+38267123456');
    expect(updateSipInboundTrunkFields).toHaveBeenCalledWith('ST_inbound', {
      numbers: { add: ['+38267123456'] },
    });
  });

  it('skips trunk sync when inbound trunk is not configured', async () => {
    const updateSipInboundTrunkFields = vi.fn();
    const service = new LiveKitSipSyncService(
      { sipClient: { updateSipInboundTrunkFields } } as never,
      {} as never,
    );
    await service.addInboundNumber('+38267123456');
    expect(updateSipInboundTrunkFields).not.toHaveBeenCalled();
  });
});
