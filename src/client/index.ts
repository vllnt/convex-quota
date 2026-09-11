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
import { DEFAULT_SCOPE } from "../shared.js";

export interface QuotaComponent {
  mutations: {
    consume: FunctionReference<
      "mutation",
      "internal",
      {
        subjectRef: string;
        key: string;
        scope: string;
        limit: number;
        amount: number;
        window: WindowSpec;
      },
      ConsumeResult
    >;
    refund: FunctionReference<
      "mutation",
      "internal",
      {
        subjectRef: string;
        key: string;
        scope: string;
        amount: number;
        periodKey: string;
      },
      RefundResult
    >;
    eraseSubject: FunctionReference<
      "mutation",
      "internal",
      { subjectRef: string; scope: string },
      number
    >;
  };
  queries: {
    remaining: FunctionReference<
      "query",
      "internal",
      {
        subjectRef: string;
        key: string;
        scope: string;
        limit: number;
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
 * Time is server-sourced inside the component.
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
      subjectRef,
      key,
      scope: this.scopeOf(opts.scope),
      limit,
      amount: opts.amount ?? 1,
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
      subjectRef,
      key,
      scope: this.scopeOf(scope),
      limit,
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
      subjectRef,
      key,
      scope: this.scopeOf(scope),
      amount,
      periodKey,
    });
  }

  eraseSubject(
    ctx: RunMutationCtx,
    subjectRef: string,
    scope?: string,
  ): Promise<number> {
    return ctx.runMutation(this.component.mutations.eraseSubject, {
      subjectRef,
      scope: this.scopeOf(scope),
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
