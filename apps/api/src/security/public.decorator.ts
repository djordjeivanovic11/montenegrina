import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE = 'montenegrina:public-route';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

