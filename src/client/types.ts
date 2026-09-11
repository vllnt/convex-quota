/** Public TypeScript surface for the quota client. */

import type { WindowSpec } from "../shared.js";

export type { WindowSpec };

export interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  used: number;
  limit: number;
  periodKey: string;
  resetsAt: number;
}

export interface RemainingState {
  remaining: number;
  used: number;
  limit: number;
  periodKey: string;
  resetsAt: number;
}

export interface RefundResult {
  refunded: boolean;
  used: number;
  remaining: number;
}

export interface QuotaOptions {
  /** Namespace applied when a call omits `scope`. Default `"global"`. */
  defaultScope?: string;
}

export interface ConsumeOptions {
  scope?: string;
  /** Units to consume. Default `1`. */
  amount?: number;
}
