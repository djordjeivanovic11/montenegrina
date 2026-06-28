import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS = 'montenegrina:permissions';
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS, permissions);

