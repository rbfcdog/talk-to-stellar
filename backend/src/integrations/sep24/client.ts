/**
 * SEP-24 HTTP Client
 *
 * Handles SEP-1 (TOML), SEP-10 (Auth), and SEP-24 (Interactive) HTTP calls.
 * Does NOT perform SEP-10 transaction signing — that's the service layer's job.
 */

import axios, { AxiosInstance } from 'axios';
import * as TOML from 'toml';
import {
  Sep10ChallengeResponse,
  Sep10TokenResponse,
  Sep24InfoResponse,
  Sep24InteractiveResponse,
  Sep24TransactionResponse,
  Sep24TransactionsResponse,
  StellarToml,
} from './types';
import { logger } from '../../utils/logger';

export class Sep24Client {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      timeout: 30_000,
      headers: { 'User-Agent': 'TalkToStellar/1.0' },
    });
  }

  // ── SEP-1 ────────────────────────────────────────────────────────

  async fetchToml(domain: string): Promise<StellarToml> {
    const url = `https://${domain}/.well-known/stellar.toml`;
    const res = await this.http.get<string>(url, {
      responseType: 'text',
      headers: { Accept: 'text/plain, application/toml, */*' },
    });
    const parsed = TOML.parse(res.data) as StellarToml;
    logger.debug(`[sep24] TOML loaded for ${domain}: transfer_server=${parsed.TRANSFER_SERVER_SEP0024}, web_auth=${parsed.WEB_AUTH_ENDPOINT}`);
    return parsed;
  }

  // ── SEP-10 ───────────────────────────────────────────────────────

  async getChallenge(webAuthEndpoint: string, account: string, homeDomain: string): Promise<Sep10ChallengeResponse> {
    const res = await this.http.get<Sep10ChallengeResponse>(webAuthEndpoint, {
      params: { account, home_domain: homeDomain },
    });
    return res.data;
  }

  async submitChallenge(webAuthEndpoint: string, signedTransaction: string): Promise<Sep10TokenResponse> {
    const res = await this.http.post<Sep10TokenResponse>(webAuthEndpoint, {
      transaction: signedTransaction,
    });
    return res.data;
  }

  // ── SEP-24 ───────────────────────────────────────────────────────

  async getInfo(transferServer: string): Promise<Sep24InfoResponse> {
    const res = await this.http.get<Sep24InfoResponse>(`${transferServer}/info`);
    return res.data;
  }

  async initiateDeposit(
    transferServer: string,
    jwt: string,
    params: {
      asset_code: string;
      asset_issuer?: string;
      account?: string;
      amount?: string;
      lang?: string;
    },
  ): Promise<Sep24InteractiveResponse> {
    const form = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) form.set(k, v); });

    const res = await this.http.post<Sep24InteractiveResponse>(
      `${transferServer}/transactions/deposit/interactive`,
      form.toString(),
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    return res.data;
  }

  async initiateWithdrawal(
    transferServer: string,
    jwt: string,
    params: {
      asset_code: string;
      asset_issuer?: string;
      account?: string;
      amount?: string;
      lang?: string;
    },
  ): Promise<Sep24InteractiveResponse> {
    const form = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) form.set(k, v); });

    const res = await this.http.post<Sep24InteractiveResponse>(
      `${transferServer}/transactions/withdraw/interactive`,
      form.toString(),
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    return res.data;
  }

  async getTransaction(transferServer: string, jwt: string, id: string): Promise<Sep24TransactionResponse> {
    const res = await this.http.get<Sep24TransactionResponse>(
      `${transferServer}/transaction`,
      {
        params: { id },
        headers: { Authorization: `Bearer ${jwt}` },
      },
    );
    return res.data;
  }

  async getTransactions(
    transferServer: string,
    jwt: string,
    params: {
      asset_code: string;
      limit?: number;
      paging_id?: string;
      kind?: 'deposit' | 'withdrawal';
    },
  ): Promise<Sep24TransactionsResponse> {
    const res = await this.http.get<Sep24TransactionsResponse>(
      `${transferServer}/transactions`,
      {
        params,
        headers: { Authorization: `Bearer ${jwt}` },
      },
    );
    return res.data;
  }
}

let _client: Sep24Client | null = null;

export function getSep24Client(): Sep24Client {
  if (!_client) _client = new Sep24Client();
  return _client;
}
