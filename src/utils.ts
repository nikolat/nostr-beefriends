import { type EventTemplate, finalizeEvent, getPublicKey } from 'npm:nostr-tools/pure';

export const enum Mode {
  Normal,
  Reply,
  Fav,
}

export class Signer {
  #seckey: Uint8Array;

  constructor(seckey: Uint8Array) {
    this.#seckey = seckey;
  }

  getPublicKey = () => {
    return getPublicKey(this.#seckey);
  };

  finishEvent = (unsignedEvent: EventTemplate) => {
    return finalizeEvent(unsignedEvent, this.#seckey);
  };
}
