/** Public TypeScript surface for the quota client. */

export type ConsumeResult = {
  allowed: boolean;
  limit: number;
  periodKey: string;
  remaining: number;
  resetsAt: number;
  used: number;
};

export type RemainingState = {
  limit: number;
  periodKey: string;
  remaining: number;
  resetsAt: number;
  used: number;
};

export type RefundResult = {
  refunded: boolean;
  remaining: number;
  used: number;
};

export type QuotaOptions = {
  /** Namespace applied when a call omits `scope`. Default `"global"`. */
  defaultScope?: string;
};

export type ConsumeOptions = {
  /** Units to consume. Default `1`. */
  amount?: number;
  scope?: string;
};

export { type WindowSpec } from "../shared.js";
