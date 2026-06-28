import type { AccessContext, DocumentAccess, MembershipRole } from './types.js';

const ROLE_ORDER: MembershipRole[] = ['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER'];

function roleRank(role: MembershipRole): number {
  return ROLE_ORDER.indexOf(role);
}

export function canAccessDocument(context: AccessContext, access: DocumentAccess): boolean {
  if (context.actorType === 'SERVICE') return true;
  if (context.actorType === 'API_KEY') {
    return access.visibility === 'ORG';
  }

  switch (access.visibility) {
    case 'ORG':
      return true;
    case 'ROLE_RESTRICTED': {
      if (!context.membershipRole || !access.minimumRole) return false;
      return roleRank(context.membershipRole) >= roleRank(access.minimumRole);
    }
    case 'GROUP_RESTRICTED':
      return access.accessGroupIds.some((groupId) => context.accessGroupIds.has(groupId));
    default:
      return false;
  }
}
