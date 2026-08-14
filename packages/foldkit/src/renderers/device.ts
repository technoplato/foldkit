import { Schema as S } from 'effect'

/** Chrome that can wrap a product tree. Host is how the process runs. */
export const Device = S.Literals(['watch', 'phone', 'tablet', 'computer', 'tv'])
/** Chrome that can wrap a product tree. */
export type Device = typeof Device.Type
