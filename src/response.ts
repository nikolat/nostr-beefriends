import { Mode, Signer } from './utils.ts';
import { uploadFile } from './nip96.ts';
import type { EventTemplate, NostrEvent, VerifiedEvent } from 'npm:nostr-tools/pure';
import * as nip19 from 'npm:nostr-tools/nip19';
import { type FileUploadResponse, type OptionalFormDataFields, readServerConfig } from 'npm:nostr-tools/nip96';
import { getToken } from 'npm:nostr-tools/nip98';
import { ImageMagick, initializeImageMagick, MagickGeometry } from 'https://deno.land/x/imagemagick_deno@0.0.14/mod.ts';
import { parseMediaType } from 'https://deno.land/std@0.175.0/media_types/parse_media_type.ts';

export const getResponseEvent = async (
  event: NostrEvent,
  signer: Signer,
  mode: Mode,
): Promise<VerifiedEvent | null> => {
  if (event.pubkey === signer.getPublicKey()) {
    //自分自身の投稿には反応しない
    return null;
  }
  const res = await selectResponse(event, mode, signer);
  if (res === null) {
    //反応しないことを選択
    return null;
  }
  return signer.finishEvent(res);
};

const selectResponse = async (
  event: NostrEvent,
  mode: Mode,
  signer: Signer,
): Promise<EventTemplate | null> => {
  if (!isAllowedToPost(event)) {
    return null;
  }
  let res: EventTemplate | null;
  switch (mode) {
    case Mode.Normal:
      res = await mode_normal(event, signer);
      break;
    case Mode.Reply:
      res = await mode_reply(event, signer);
      break;
    case Mode.Fav:
      res = mode_fav(event);
      break;
    default:
      throw new TypeError(`unknown mode: ${mode}`);
  }
  return res;
};

const isAllowedToPost = (event: NostrEvent) => {
  const allowedChannel = [
    'be8e52c0c70ec5390779202b27d9d6fc7286d0e9a2bc91c001d6838d40bafa4a', //Nostr伺か部
    '8206e76969256cd33277eeb00a45e445504dfb321788b5c3cc5d23b561765a74', //うにゅうハウス開発
    '330fc57e48e39427dd5ea555b0741a3f715a55e10f8bb6616c27ec92ebc5e64b', //カスタム絵文字の川
    'c8d5c2709a5670d6f621ac8020ac3e4fc3057a4961a15319f7c0818309407723', //Nostr麻雀開発部
    '5b0703f5add2bb9e636bcae1ef7870ba6a591a93b6b556aca0f14b0919006598', //₍ ﾃｽﾄ ₎
  ];
  const disallowedNpubs = [
    'npub1j0ng5hmm7mf47r939zqkpepwekenj6uqhd5x555pn80utevvavjsfgqem2', //雀卓
  ];
  if (disallowedNpubs.includes(nip19.npubEncode(event.pubkey))) {
    return false;
  }
  const disallowedTags = ['content-warning', 'proxy'];
  if (
    event.tags.some(
      (tag: string[]) => tag.length >= 1 && disallowedTags.includes(tag[0]),
    )
  ) {
    return false;
  }
  if (event.kind === 1) {
    return true;
  } else if (event.kind === 42) {
    const tagRoot = event.tags.find(
      (tag: string[]) => tag.length >= 4 && tag[0] === 'e' && tag[3] === 'root',
    );
    if (tagRoot !== undefined) {
      return allowedChannel.includes(tagRoot[1]);
    } else {
      throw new TypeError('root is not found');
    }
  } else if (event.kind === 9735) {
    return true;
  }
  throw new TypeError(`kind ${event.kind} is not supported`);
};

const getResmap = (
  mode: Mode,
): [
  RegExp,
  (
    event: NostrEvent,
    mode: Mode,
    regstr: RegExp,
    signer: Signer,
  ) => Promise<[string, string[][]] | null> | [string, string[][]] | null,
][] => {
  const resmapNormal: [
    RegExp,
    (
      event: NostrEvent,
      mode: Mode,
      regstr: RegExp,
    ) => [string, string[][]] | null,
  ][] = [[/(ねる)+ね/g, res_nerune]];
  const resmapReply: [
    RegExp,
    (
      event: NostrEvent,
      mode: Mode,
      regstr: RegExp,
      signer: Signer,
    ) => Promise<[string, string[][]] | null> | [string, string[][]] | null,
  ][] = [
    [/おはよ/, res_ohayo],
    [/image\sresize\s(\d+)x(\d+)/, res_image_resize],
  ];
  switch (mode) {
    case Mode.Normal:
      return resmapNormal;
    case Mode.Reply:
      return [...resmapNormal, ...resmapReply];
    default:
      throw new TypeError(`unknown mode: ${mode}`);
  }
};

const mode_normal = async (
  event: NostrEvent,
  signer: Signer,
): Promise<EventTemplate | null> => {
  //自分への話しかけはreplyで対応する
  //自分以外に話しかけている場合は割り込まない
  if (event.tags.some((tag: string[]) => tag.length >= 2 && tag[0] === 'p')) {
    return null;
  }
  const resmap = getResmap(Mode.Normal);
  for (const [reg, func] of resmap) {
    if (reg.test(event.content)) {
      const res = await func(event, Mode.Normal, reg, signer);
      if (res === null) {
        return null;
      }
      const [content, tags] = res;
      return {
        content,
        kind: event.kind,
        tags,
        created_at: event.created_at + 1,
      };
    }
  }
  return null;
};

const mode_reply = async (
  event: NostrEvent,
  signer: Signer,
): Promise<EventTemplate | null> => {
  const resmap = getResmap(Mode.Reply);
  for (const [reg, func] of resmap) {
    if (reg.test(event.content)) {
      const res = await func(event, Mode.Reply, reg, signer);
      if (res === null) {
        return null;
      }
      const [content, tags] = res;
      return {
        content,
        kind: event.kind,
        tags,
        created_at: event.created_at + 1,
      };
    }
  }
  return null;
};

const mode_fav = (event: NostrEvent): EventTemplate | null => {
  const reactionmap: [RegExp, string][] = [
    [/びーも.*そう(思|おも)う/, any(['🙂‍↕', '🙂‍↔'])],
  ];
  for (const [reg, content] of reactionmap) {
    if (reg.test(event.content)) {
      const kind: number = 7;
      const tags: string[][] = getTagsFav(event);
      return { content, kind, tags, created_at: event.created_at + 1 };
    }
  }
  return null;
};

const res_ohayo = (event: NostrEvent): [string, string[][]] => {
  return ['おはようございます！', getTagsReply(event)];
};

const res_image_resize = async (
  event: NostrEvent,
  _mode: Mode,
  regstr: RegExp,
  signer: Signer,
): Promise<[string, string[][]] | null> => {
  const targetUrlToUpload = 'https://yabu.me';
  const match = event.content.match(regstr);
  if (match === null) {
    throw new Error();
  }
  const width = parseInt(match[1]);
  const height = parseInt(match[2]);
  const imageUrl = event.tags.find((tag) => tag.length >= 2 && tag[0] === 'r' && URL.canParse(tag[1]))?.at(1);
  if (imageUrl === undefined) {
    return ['rタグに画像のURLを指定してくださいね！', getTagsReply(event)];
  }
  if (width > 1000 || height > 1000) {
    return ['大きすぎます…', getTagsReply(event)];
  }
  await initializeImageMagick();
  const getRemoteImage = async (url: string) => {
    const sourceRes = await fetch(url);
    if (!sourceRes.ok) {
      console.error('Error retrieving image from URL.');
      return null;
    }
    const mediaType = parseMediaType(sourceRes.headers.get('Content-Type')!)[0];
    if (mediaType.split('/')[0] !== 'image') {
      console.error('URL is not image type.');
      return null;
    }
    return {
      buffer: new Uint8Array(await sourceRes.arrayBuffer()),
      mediaType,
    };
  };
  const remoteImage = await getRemoteImage(imageUrl);
  if (remoteImage === null) {
    return ['画像の取得に失敗しました…', getTagsReply(event)];
  }
  const modifyImage = (
    imageBuffer: Uint8Array,
    params: { width: number; height: number },
  ) => {
    const sizingData = new MagickGeometry(
      params.width,
      params.height,
    );
    sizingData.ignoreAspectRatio = params.height > 0 && params.width > 0;
    return new Promise<Uint8Array>((resolve) => {
      ImageMagick.read(imageBuffer, (image) => {
        image.resize(sizingData);
        image.write((data) => resolve(data));
      });
    });
  };
  const modifiedImage = await modifyImage(remoteImage.buffer, { width, height });
  const f = (e: EventTemplate) => signer.finishEvent(e);
  const c = await readServerConfig(targetUrlToUpload);
  const s = await getToken(c.api_url, 'POST', f, true);
  const blob = new Blob([modifiedImage], { type: remoteImage.mediaType });
  const file = new File([blob], 'dummy_filename', { type: remoteImage.mediaType });
  const option: OptionalFormDataFields = {
    size: String(file.size),
    content_type: file.type,
  };
  const fileUploadResponse: FileUploadResponse = await uploadFile(file, c.api_url, s, option);
  const uploadedUrl = fileUploadResponse.nip94_event?.tags.find((tag) => tag.length >= 2 && tag[0] === 'url')?.at(1);
  if (uploadedUrl === undefined) {
    return ['画像のアップロードに失敗しました…', getTagsReply(event)];
  }
  return [`できました！\n${uploadedUrl}`, [...getTagsReply(event), ['r', uploadedUrl]]];
};

const res_nerune = (
  event: NostrEvent,
  _mode: Mode,
  regstr: RegExp,
): [string, string[][]] => {
  const match = event.content.match(regstr);
  if (match === null) {
    throw new Error();
  }
  let count = 0;
  for (const m of match) {
    count += m.match(/ねる/g)?.length ?? 0;
  }
  const quote = event.kind === 1 ? nip19.noteEncode(event.id) : nip19.neventEncode(event);
  return [`${count}ねるねです！\nnostr:${quote}`, getTagsQuote(event)];
};

const _getTagsAirrep = (event: NostrEvent): string[][] => {
  if (event.kind === 1) {
    return [['e', event.id, '', 'mention']];
  } else if (event.kind === 42) {
    const tagRoot = event.tags.find(
      (tag: string[]) => tag.length >= 4 && tag[0] === 'e' && tag[3] === 'root',
    );
    if (tagRoot !== undefined) {
      return [tagRoot, ['e', event.id, '', 'mention']];
    } else {
      throw new TypeError('root is not found');
    }
  }
  throw new TypeError(`kind ${event.kind} is not supported`);
};

const getTagsReply = (event: NostrEvent): string[][] => {
  const tagsReply: string[][] = [];
  const tagRoot = event.tags.find(
    (tag: string[]) => tag.length >= 3 && tag[0] === 'e' && tag[3] === 'root',
  );
  if (tagRoot !== undefined) {
    tagsReply.push(tagRoot);
    tagsReply.push(['e', event.id, '', 'reply']);
  } else {
    tagsReply.push(['e', event.id, '', 'root']);
  }
  for (
    const tag of event.tags.filter(
      (tag: string[]) => tag.length >= 2 && tag[0] === 'p' && tag[1] !== event.pubkey,
    )
  ) {
    tagsReply.push(tag);
  }
  tagsReply.push(['p', event.pubkey, '']);
  return tagsReply;
};

const getTagsQuote = (event: NostrEvent): string[][] => {
  if (event.kind === 1) {
    return [['q', event.id]];
  } else if (event.kind === 42) {
    const tagRoot = event.tags.find(
      (tag: string[]) => tag.length >= 4 && tag[0] === 'e' && tag[3] === 'root',
    );
    if (tagRoot !== undefined) {
      return [tagRoot, ['e', event.id, '', 'mention']];
    } else {
      throw new TypeError('root is not found');
    }
  }
  throw new TypeError(`kind ${event.kind} is not supported`);
};

const getTagsFav = (event: NostrEvent): string[][] => {
  const tagsFav: string[][] = [
    ...event.tags.filter(
      (tag: string[]) =>
        tag.length >= 2 &&
        (tag[0] === 'e' || (tag[0] === 'p' && tag[1] !== event.pubkey)),
    ),
    ['e', event.id, '', ''],
    ['p', event.pubkey, ''],
    ['k', String(event.kind)],
  ];
  return tagsFav;
};

const any = (array: string[]): string => {
  return array[Math.floor(Math.random() * array.length)];
};
