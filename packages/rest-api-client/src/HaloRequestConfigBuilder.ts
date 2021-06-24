import FormData from "form-data";
import qs from "qs";
import { Base64 } from "js-base64";

import {
  RequestConfigBuilder,
  RequestConfig,
  HttpMethod,
  Params,
  ProxyConfig,
  TokenProvider
} from "./types";
import { BasicAuth, DiscriminatedAuth, SESSION_TOKEN_KEY } from "./types/auth";
import { platformDeps } from "./platform/";

type Data = Params | FormData | Array<any>;

const THRESHOLD_AVOID_REQUEST_URL_TOO_LARGE = 4096;

export class HaloRequestConfigBuilder implements RequestConfigBuilder {
  private baseUrl: string;
  private headers: any;
  private auth?: DiscriminatedAuth;
  private tokenProvider?: TokenProvider;
  private clientCertAuth?:
    | {
      pfx: Buffer;
      password: string;
    }
    | {
      pfxFilePath: string;
      password: string;
    };
  private proxy?: ProxyConfig;
  private requestToken: string | null;

  constructor({
    baseUrl,
    auth,
    basicAuth,
    clientCertAuth,
    proxy,
    userAgent,
    tokenProvider,
  }: {
    baseUrl: string;
    auth?: DiscriminatedAuth;
    basicAuth?: BasicAuth;
    clientCertAuth?:
    | {
      pfx: Buffer;
      password: string;
    }
    | {
      pfxFilePath: string;
      password: string;
    };
    proxy?: ProxyConfig;
    userAgent?: string;
    tokenProvider?: TokenProvider;
  }) {
    this.baseUrl = baseUrl;
    this.auth = auth;
    this.headers = this.buildHeaders({ basicAuth, userAgent });
    this.clientCertAuth = clientCertAuth;
    this.proxy = proxy;
    this.requestToken = null;
    this.tokenProvider = tokenProvider;
  }

  public async build(
    method: HttpMethod,
    path: string,
    params: Data,
    options?: { responseType: "arraybuffer" }
  ) {
    if (this.tokenProvider) {
      const provider = this.tokenProvider;
      const data = {
        authHeader: this.tokenProvider.getAuthHeader(),
        async getToken() {
          const token = await provider.getToken();
          if (token) {
            return token.access_token;
          }
          return "";
        },
      };
      console.log(await data.getToken());
      this.headers[data.authHeader] = await data.getToken();
    }
    const requestConfig: RequestConfig = {
      method,
      headers: this.headers,
      url: `${this.baseUrl}${path}`,
      ...(options ? options : {}),
      ...platformDeps.buildPlatformDependentConfig({
        clientCertAuth: this.clientCertAuth,
      }),
      proxy: this.proxy,
    };

    switch (method) {
      case "get": {
        const requestUrl = this.buildRequestUrl(path, params);
        if (requestUrl.length > THRESHOLD_AVOID_REQUEST_URL_TOO_LARGE) {
          return {
            ...requestConfig,
            method: "post" as const,
            headers: { ...this.headers, "X-HTTP-Method-Override": "GET" },
            data: await this.buildData(params),
          };
        }
        return {
          ...requestConfig,
          url: requestUrl,
        };
      }
      case "post": {
        if (params instanceof FormData) {
          const formData = await this.buildData(params);
          return {
            ...requestConfig,
            headers:
              // NOTE: formData.getHeaders does not exist in a browser environment.
              typeof formData.getHeaders === "function"
                ? { ...this.headers, ...formData.getHeaders() }
                : this.headers,
            data: formData,
          };
        }
        return {
          ...requestConfig,
          data: await this.buildData(params),
        };
      }
      case "put": {
        return {
          ...requestConfig,
          data: await this.buildData(params),
        };
      }
      case "delete": {
        if (params instanceof Array) {
          return {
            ...requestConfig,
            headers: this.headers,
            data: params,
          };
        }
        const requestUrl = this.buildRequestUrl(
          path,
          await this.buildData(params)
        );
        return {
          ...requestConfig,
          url: requestUrl,
        };
      }
      default: {
        throw new Error(`${method} method is not supported`);
      }
    }
  }

  private buildRequestUrl(path: string, params: Data): string {
    return `${this.baseUrl}${path}?${qs.stringify(params, { indices: false })}`;
  }

  private async buildData<T extends Data>(params: T): Promise<T> {
    if (this.auth && this.auth.type === "session") {
      const requestToken = await this.getRequestToken();
      if (params instanceof FormData) {
        params.append(SESSION_TOKEN_KEY, requestToken);
        return params;
      }
      return {
        [SESSION_TOKEN_KEY]: requestToken,
        ...params,
      };
    }
    return params;
  }

  private buildHeaders(params: {
    basicAuth?: BasicAuth;
    userAgent?: string;
  }): any {
    const { basicAuth, userAgent } = params;
    const basicAuthHeaders = basicAuth
      ? {
        Authorization: `Basic ${Base64.encode(
          `${basicAuth.username}:${basicAuth.password}`
        )}`,
      }
      : {};
    const platformDepsHeaders = platformDeps.buildHeaders({ userAgent });
    const commonHeaders = { ...platformDepsHeaders, ...basicAuthHeaders };

    if (!this.auth) {
      return {};
    }

    switch (this.auth.type) {
      case "password": {
        return {
          ...commonHeaders,
          Authorization: Base64.encode(
            `${this.auth.username}:${this.auth.password}`
          ),
        };
      }
      case "adminToken": {
        const adminToken = this.auth.adminToken;
        return {
          ...commonHeaders,
          "Admin-Authorization": adminToken,
        };
      }
      case "apiToken": {
        const apiToken = this.auth.apiToken;
        if (Array.isArray(apiToken)) {
          return {
            ...commonHeaders,
            "API-Authorization": apiToken.join(","),
          };
        }
        return { ...commonHeaders, "API-Authorization": apiToken };
      }
      case "oAuthToken": {
        return {
          ...commonHeaders,
          Authorization: `Bearer ${this.auth.oAuthToken}`,
        };
      }
      case "customizeAuth": {
        return {
          ...commonHeaders,
          [this.auth.authHeader]: this.auth.getToken(),
        };
      }
      default: {
        // https://developer.mozilla.org/zh-CN/docs/Web/API/XMLHttpRequest
        return { ...commonHeaders, "X-Requested-With": "XMLHttpRequest" };
      }
    }
  }

  public setTokenProvider(tokenProvider: TokenProvider) {
    this.tokenProvider = tokenProvider;
  }

  public getTokenProvider() {
    return this.tokenProvider;
  }

  private async getRequestToken(): Promise<string> {
    if (this.requestToken === null) {
      this.requestToken = await platformDeps.getRequestToken();
    }
    return this.requestToken;
  }
}
