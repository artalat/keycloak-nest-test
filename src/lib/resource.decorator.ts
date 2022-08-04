import { SetMetadata } from '@nestjs/common';
import {
  extractResourceName,
  ResourceDecoratorOptions,
} from './extractResourceName';

export const META_RESOURCE = 'resource';

/**
 * Keycloak Resource.
 * @param resource - name of resource
 */
export const Resource = (resource: string | ResourceDecoratorOptions) =>
  SetMetadata(
    META_RESOURCE,
    typeof resource === 'string' ? resource : extractResourceName(resource),
  );
