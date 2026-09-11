import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import type {
  ConsumeOptions,
  ConsumeResult,
  QuotaOptions,
  RefundResult,
  RemainingState,
  WindowSpec,
} from "./types.js";
import { DEFAULT_ERASE_BATCH, DEFAULT_SCOPE } from "../shared.js";

export interface QuotaComponent {
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
}

interface RunQueryCtx {
  runQuery<Q extends FunctionReference<"query", "internal">>(
    reference: Q,
    args: FunctionArgs<Q>,
  ): Promise<FunctionReturnType<Q>>;
}

interface RunMutationCtx {
  runMutation<M extends FunctionReference<"mutation", "internal">>(
    reference: M,
    args: FunctionArgs<M>,
  ): Promise<FunctionReturnType<M>>;
}

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

  consume(
    ctx: RunMutationCtx,
    subjectRef: string,
    key: string,
    limit: number,
    window: WindowSpec,
    opts: ConsumeOptions = {},
  ): Promise<ConsumeResult> {
    return ctx.runMutation(this.component.mutations.consume, {
      amount: opts.amount ?? 1,
      key,
      limit,
      scope: this.scopeOf(opts.scope),
      subjectRef,
      window,
    });
  }

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

export type {
  ConsumeOptions,
  ConsumeResult,
  QuotaOptions,
  RefundResult,
  RemainingState,
  WindowSpec,
};
