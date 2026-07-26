import { Effect, Layer } from 'effect'
import { HttpClient, HttpClientResponse } from 'effect/unstable/http'
import { Fact, FactClient, FactClientError } from 'fact-core-example'

/** The public controlled endpoint used by the replay side-effect proof. */
export const factEndpoint = 'https://tapes.knophy.com/demo-effects/fact'

/** Builds a FactClient Layer from the host's platform HTTP client. */
export const makeFactHttpClient = (
  endpoint: string,
): Layer.Layer<FactClient, never, HttpClient.HttpClient> =>
  Layer.effect(
    FactClient,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      return {
        fetch: client.post(endpoint).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Fact)),
          Effect.mapError(cause => new FactClientError({ cause })),
        ),
      }
    }),
  )
