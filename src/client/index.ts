import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";

import { DEFAULT_SCOPE } from "../shared.js";

import type {
  ConsumeOptions,
  ConsumeResult,
  QuotaOptions,
  RefundResult,
  RemainingState,
  WindowSpec,
} from "./types.js";

export type QuotaComponent = {
  mutations: {
    consume: FunctionReference<
      "mutation",
      "internal",
      {
        amount: number;
        key: string;
        limit: number;
        scope: string;
        subjectRef: string;
        window: WindowSpec;
      },
      ConsumeResult
    >;
    eraseSubject: FunctionReference<
      "mutation",
      "internal",
      { batch?: number; scope: string; subjectRef: string },
      number
    >;
    refund: FunctionReference<
      "mutation",
      "internal",
      {
        amount: number;
        key: string;
        periodKey: string;
        scope: string;
        subjectRef: string;
      },
      RefundResult
    >;
  };
  queries: {
    remaining: FunctionReference<
      "query",
      "internal",
      {
        key: string;
        limit: number;
        scope: string;
        subjectRef: string;
        window: WindowSpec;
      },
      RemainingState
    >;
  };
};

type RunQueryCtx = {
  runQuery<TQuery extends FunctionReference<"query", "internal">>(
    reference: TQuery,
    arguments_: FunctionArgs<TQuery>,
  ): Promise<FunctionReturnType<TQuery>>;
};

type RunMutationCtx = {
  runMutation<TMutation extends FunctionReference<"mutation", "internal">>(
    reference: TMutation,
    arguments_: FunctionArgs<TMutation>,
  ): Promise<FunctionReturnType<TMutation>>;
};

/**
 * Consumer-facing client for the scheduled-reset quota ledger. The host owns
 * auth and meaning; it passes an opaque `subjectRef` + `key` and a window spec.
 * Never take `limit` from an end-user. Time is server-sourced. Consume is not
 * idempotent — wrap with `@vllnt/convex-idempotency` if retries must not double-count.
 */
export class Quota {
  private readonly defaultScope: string;

  constructor(
    private readonly component: QuotaComponent,
    options: QuotaOptions = {},
  ) {
    this.defaultScope = options.defaultScope ?? DEFAULT_SCOPE;
  }

  private scopeOf(scope?: string): string {
    return scope ?? this.defaultScope;
  }

  // eslint-disable-next-line max-params -- Preserve the published positional client contract.
  consume(
    ctx: RunMutationCtx,
    subjectRef: string,
    key: string,
    limit: number,
    window: WindowSpec,
    options: ConsumeOptions = {},
  ): Promise<ConsumeResult> {
    return ctx.runMutation(this.component.mutations.consume, {
      amount: options.amount ?? 1,
      key,
      limit,
      scope: this.scopeOf(options.scope),
      subjectRef,
      window,
    });
  }

  // eslint-disable-next-line max-params -- Preserve the published positional client contract.
  remaining(
    ctx: RunQueryCtx,
    subjectRef: string,
    key: string,
    limit: number,
    window: WindowSpec,
    scope?: string,
  ): Promise<RemainingState> {
    return ctx.runQuery(this.component.queries.remaining, {
      key,
      limit,
      scope: this.scopeOf(scope),
      subjectRef,
      window,
    });
  }

  // eslint-disable-next-line max-params -- Preserve the published positional client contract.
  refund(
    ctx: RunMutationCtx,
    subjectRef: string,
    key: string,
    amount: number,
    periodKey: string,
    scope?: string,
  ): Promise<RefundResult> {
    return ctx.runMutation(this.component.mutations.refund, {
      amount,
      key,
      periodKey,
      scope: this.scopeOf(scope),
      subjectRef,
    });
  }

  // eslint-disable-next-line max-params -- Preserve the published positional client contract.
  eraseSubject(
    ctx: RunMutationCtx,
    subjectRef: string,
    scope?: string,
    batch?: number,
  ): Promise<number> {
    return ctx.runMutation(this.component.mutations.eraseSubject, {
      batch,
      scope: this.scopeOf(scope),
      subjectRef,
    });
  }
}

export {
  type ConsumeOptions,
  type ConsumeResult,
  type QuotaOptions,
  type RefundResult,
  type RemainingState,
  type WindowSpec,
} from "./types.js";
