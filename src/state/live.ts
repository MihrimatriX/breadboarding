/**
 * Her karede değişen büyük diziler React durumuna konmaz; render döngüsü
 * (useFrame) bunları doğrudan buradan okur ve `version` değiştiğinde GPU'ya yükler.
 */
export const live = {
  nodeState: null as Uint8Array | null,
  transistorOn: null as Uint8Array | null,
  version: 0,
};
