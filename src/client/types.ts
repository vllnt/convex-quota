/** Public TypeScript surface for the quota client. */

/** Result of `consume`: the decision and the window state after it. */
export type ConsumeResult = {
  allowed: boolean;
  limit: number;
  periodKey: string;
  remaining: number;
  resetsAt: number;
  used: number;
};

/** Result of `remaining`: the current window state, read without writing. */
export type RemainingState = {
  limit: number;
  periodKey: string;
  remaining: number;
  resetsAt: number;
  used: number;
};

/**
 * Result of `refund`: whether the refund applied (matching, unexpired
 * `periodKey`; also `true` when `used` was already 0), and the stored row's
 * `used` and `remaining`.
 */
export type RefundResult = {
  refunded: boolean;
  remaining: number;
  used: number;
};

/** Options for `new Quota(component, options)`. */
export type QuotaOptions = {
  /** Namespace applied when a call omits `scope`. Default `"global"`. */
  defaultScope?: string;
};

/** Options for `consume`. */
export type ConsumeOptions = {
  /** Units to consume. Default `1`. */
  amount?: number;
  /** Namespace for this call. Default: the client's `defaultScope`. */
  scope?: string;
};

export { type WindowSpec } from "../shared.js";
