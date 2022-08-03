/* eslint-disable camelcase */
import { HttpService, Injectable, Logger } from '@nestjs/common';
import { Dictionary } from 'lodash';
import * as qs from 'qs';
import { KeyCloakConfigService } from './keycloak-config.service';
import URL from 'url';

export interface KeycloakProtectionQueryParams extends Dictionary<any> {
  name?: string;
  uri?: string;
  owner?: any;
  type?: string;
  scope?: string;
}

@Injectable()
export class KeycloakProtectionService {
  private logger: Logger = new Logger(this.constructor.name);

  constructor(
    private readonly configs: KeyCloakConfigService,
    private readonly httpService: HttpService,
  ) {}

  public async createResource(data: any): Promise<any> {
    const pat = await this.getProtectionApiToken();
    const url = await this.getBaseUrl();

    console.log('creating', url, data);

    try {
      const result = await this.httpService
        .post(url, data, {
          headers: {
            Authorization: `Bearer ${pat}`,
            'Content-Type': 'application/json',
          },
        })
        .toPromise();

      console.log('done');
    } catch (error) {
      console.error(error);
    }
  }

  public async updateResource(resourceId: string, data: any): Promise<any> {
    const pat = await this.getProtectionApiToken();
    const url = await this.getBaseUrl();

    await this.httpService
      .put(`${url}/${resourceId}`, data, {
        headers: {
          Authorization: `Bearer ${pat}`,
          'Content-Type': 'application/json',
        },
      })
      .toPromise();
  }

  public async deleteResource(resourceId: string): Promise<any> {
    const pat = await this.getProtectionApiToken();
    const url = await this.getBaseUrl();

    await this.httpService
      .delete(`${url}/${resourceId}`, {
        headers: {
          Authorization: `Bearer ${pat}`,
        },
      })
      .toPromise();
  }

  public async getOne(resourceId: string): Promise<any> {
    const pat = await this.getProtectionApiToken();
    const url = await this.getBaseUrl();

    const result = await this.httpService
      .get(`${url}/${resourceId}`, {
        headers: {
          Authorization: `Bearer ${pat}`,
          'Content-Type': 'application/json',
        },
      })
      .toPromise();

    return result.data;
  }

  public async query(params: KeycloakProtectionQueryParams): Promise<any> {
    const pat = await this.getProtectionApiToken();
    console.log('pat', pat);

    const url = await this.getBaseUrl();

    const result = await this.httpService
      .get(url, {
        headers: {
          Authorization: `Bearer ${pat}`,
          'Content-Type': 'application/json',
        },
        params,
      })
      .toPromise();
    console.log('result', result);

    return result.data;
  }

  public async checkPermissions(
    options: { resource?: string; scopes?: string[] | string },
    config: any,
    request: any,
  ): Promise<any> {
    // Resolve scopes
    const scopes =
      typeof options.scopes === 'string' ? [options.scopes] : options.scopes;

    // Buils an auth request
    const authzRequest: any = {
      audience: config.resource_server_id,
      response_mode: config.response_mode,
    };

    // Add claims, if any
    if (config.claims) {
      const claims = config.claims(request);

      if (claims) {
        authzRequest.claim_token = Buffer.from(JSON.stringify(claims)).toString(
          'base64',
        );
        authzRequest.claim_token_format =
          'urn:ietf:params:oauth:token-type:jwt';
      }
    }

    // Build the check permissions params
    const params: any = {
      grant_type: 'urn:ietf:params:oauth:grant-type:uma-ticket',
    };

    if (authzRequest.audience) {
      params.audience = authzRequest.audience;
    } else {
      params.audience = config.clientId;
    }

    if (authzRequest.response_mode) {
      params.response_mode = authzRequest.response_mode;
    }

    if (authzRequest.claim_token) {
      params.claim_token = authzRequest.claim_token;
      params.claim_token_format = authzRequest.claim_token_format;
    }

    /// post options
    const realPath = '/protocol/openid-connect/token';
    const postOptions: any = URL.parse(config.realmUrl + realPath); // eslint-disable-line
    postOptions.headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      // 'X-Client': 'keycloak-nodejs-connect',
    };
    if (!config.public) {
      postOptions.headers.Authorization =
        'Basic ' +
        Buffer.from(config.clientId + ':' + config.secret).toString('base64');
    }
    postOptions.method = 'POST';
    //

    if (config.public) {
      if (
        request.kauth &&
        request.kauth.grant &&
        request.kauth.grant.access_token
      ) {
        postOptions.headers.Authorization =
          'Bearer ' + request.kauth.grant.access_token.token;
      }
    } else {
      const header = request.headers.authorization;
      let bearerToken;

      if (
        header &&
        (header.indexOf('bearer ') === 0 || header.indexOf('Bearer ') === 0)
      ) {
        bearerToken = header.substring(7);
      }

      if (!bearerToken) {
        if (
          request.kauth &&
          request.kauth.grant &&
          request.kauth.grant.access_token
        ) {
          bearerToken = request.kauth.grant.access_token.token;
        } else {
          return Promise.reject(new Error('No bearer in header'));
        }
      }

      params.subject_token = bearerToken;
    }

    // params.permission = ['123#album:view'];
    params.permission = [
      scopes.length > 0
        ? `${options.resource}#${scopes.join(', ')}`
        : options.resource,
    ];

    const json = await this.httpService
      .request<{ result: boolean }>({
        ...postOptions,
        data: params,
      })
      .toPromise();

    return json.data.result;
  }

  public async hasPermission(
    options: { resource?: string; scopes?: string[] | string },
    Authorization: string,
  ): Promise<boolean> {
    const configs: any = await this.configs.createKeycloakConnectOptions();

    // Resolve scopes
    const scopes =
      typeof options.scopes === 'string' ? [options.scopes] : options.scopes;

    // ['123#album:view']
    const permission = [
      scopes.length > 0
        ? `${options.resource}#${scopes.join(', ')}`
        : options.resource,
    ];

    this.logger.verbose(`Checking permissions: ${JSON.stringify(permission)}`);

    try {
      const json = await this.httpService
        .request<{ result: boolean }>({
          method: 'POST',
          url: `${configs['auth-server-url']}/realms/${configs.realm}/protocol/openid-connect/token`,
          headers: {
            Authorization,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          data: qs.stringify({
            grant_type: 'urn:ietf:params:oauth:grant-type:uma-ticket',
            audience: configs.resource_server_id ?? configs.clientId,
            response_mode: 'decision',
            permission,
          }),
        })
        .toPromise();

      return json.data.result;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }

  private async getProtectionApiToken() {
    const configs: any = await this.configs.createKeycloakConnectOptions();

    const result = await this.httpService
      .post(
        `${configs['auth-server-url']}/realms/${configs.realm}/protocol/openid-connect/token`,
        qs.stringify({
          grant_type: 'client_credentials',
          client_id: configs.clientId,
          client_secret: configs.secret,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      )
      .toPromise();

    const pat = result.data['access_token'];
    return pat;
  }

  private async getBaseUrl() {
    const configs: any = await this.configs.createKeycloakConnectOptions();
    const url = `${configs['auth-server-url']}/realms/${configs.realm}/authz/protection/resource_set`;

    return url;
  }
}
