// Hand-audited cartridge identities accepted by the asset-free setup page.
// Digests are metadata only. No cartridge bytes are stored in this tree.

export const CATALOGUE_PROVENANCE = Object.freeze({
  batman: 'games/batman/game.json; SHA-256 independently measured from the verified ignored local image on 2026-08-23',
  gradius: 'games/gradius/game.json and games/gradius/README.md; SHA-256 independently measured from the verified ignored local image on 2026-08-23',
  ddpdoj: 'games/ddpdoj/rip/assets/manifest.json and games/ddpdoj/NOTES-machine.md; generated manifest values transcribed into this tracked catalogue on 2026-08-23',
  ddpdojDecrypted: 'games/ddpdoj/README.md, decrypted combined maincpu image measurement',
});

const member = (name, size, sha256, inputForm, extra = {}) => Object.freeze({
  name, size, sha256, inputForm, ...extra,
});

const batman = Object.freeze({
  id: 'batman',
  title: 'Batman: Return of the Joker',
  region: 'USA, Europe',
  revision: 'No separate revision marker is recorded',
  set: null,
  notes: [
    'The accepted region label is USA, Europe, as recorded by the verified cartridge identity and filename.',
    'Supply the complete raw Game Boy cartridge image, not an archive.',
  ],
  accepted: Object.freeze([
    member('Batman - Return of the Joker (USA, Europe).gb', 131072,
      '152fc252bba7130e786d408eed310b3009b8e05834f8003dfbf514ec804cbaea',
      'Complete raw Game Boy cartridge image', {
        sha1: '345a332175f58304f91111a13b770662e5ea92c3',
        crc32: '5124bbec',
        md5: '97bc907deba1e7d7c9bc72fca0310822',
        headerTitle: 'BATMAN ROJ',
      }),
  ]),
});

const gradius = Object.freeze({
  id: 'gradius',
  title: 'Gradius',
  region: 'USA',
  revision: 'No separate revision marker is recorded',
  set: null,
  notes: [
    'Supply the complete iNES file including its 16-byte header, not split PRG or CHR files.',
    'The accepted image is mapper 3 CNROM with 32 KiB PRG, 32 KiB CHR, vertical mirroring, and no trainer.',
  ],
  accepted: Object.freeze([
    member('Gradius (USA).nes', 65552,
      '38c44e0e6f531a2779271f10cd4daa08ee2616c59c49d476b6f4e9dc482bf5f3',
      'Complete iNES cartridge image including 16-byte header', {
        sha1: '92645fe142861c3d3fda209bb906ad2b0e353988',
        crc32: '54f1af1f',
      }),
  ]),
});

const ddpdojMembers = Object.freeze([
  member('cave_a04401w064.u7', 8388608, '7c137d77cab1a1f15439caa8f7a0c41c42ab79b468a764b4af1e4b89d95aae20', 'Extracted MAME set member', { crc32: 'ed229794' }),
  member('cave_a04402w064.u8', 8388608, '5aa661f836066576588b255df93c9235e561669756643aa51575d2b74e5c4223', 'Extracted MAME set member', { crc32: '752167b0' }),
  member('cave_b04401w064.u1', 8388608, '829b3dd406e040778b17f642f6ef79941d4c819286ebb8cab4b2216ed95f6620', 'Extracted MAME set member', { crc32: '17731c9d' }),
  member('cave_m04401b032.u17', 4194304, '456146197799e0786032a6b3a8b70d7edfc0a2e51edd06da82cc71ca266eeaa7', 'Extracted MAME set member', { crc32: '5a0dbd76' }),
  member('cave_t04401w064.u19', 8388608, '7a54fa9832c3d66b8f6da847cdde19e5c515afc16fae4e0a78be5229959b7054', 'Extracted MAME set member', { crc32: '3a95f19c' }),
  member('ddb10_10_8_434f.u45', 2097152, 'b9c7348de654a3ecfb6708d840e840df508561e0f46c4830c459e03296840a21', 'Raw encrypted MAME program member', {
    crc32: 'd21561db',
    sha1: '66a0103bc5f17b28736b562e32807271a5afa261',
    byteSwappedSha256: '6559bba975004669eb5573a3ae28a8c73a140ff3a8c4f171d61ca88ebe524f5f',
  }),
  member('ddp3_bios.u37', 524288, '606483f3eaaf037d51dc1fc013926e8e1e8da4b2cfbb4da9de6d0dd7ead6e1ab', 'Extracted MAME set member', { crc32: 'b3cc5c8f' }),
  member('ddp3blk_defaults.nv', 131072, '17e919ff78115909997dc3a6c53ebfb08b88cc57a2c5ed7c08f31ecb37cb18e3', 'Extracted MAME default NVRAM member', { crc32: 'c2282720' }),
  member('pgm_m01s.rom', 2097152, '111e9b2c455e5a2a6fb92cae7785bcb837c257c85bb70d6f65bf64660da3194d', 'Extracted MAME BIOS sound member', { crc32: '45ae7159' }),
  member('pgm_t01s.rom', 2097152, 'c128ef491505564550f3fe61363a5d7671d102721710ed3bcf91c14d1b355b19', 'Extracted MAME BIOS text member', { crc32: '1a7123a0' }),
]);

const ddpdoj = Object.freeze({
  id: 'ddpdoj',
  title: 'DoDonPachi DaiOuJou Black Label',
  region: 'Japan',
  revision: 'Black Label Version B, 2002.10.07 BLACK VER',
  set: 'ddpdojblk',
  notes: [
    'Supply the ten extracted MAME members listed below. ZIP and 7z containers are not accepted yet.',
    'ddb10_10_8_434f.u45 is the raw encrypted program member. MAME loads it with 16-bit word swapping and decrypts it in place.',
    'The protection ROM is undumped. MAME simulates the protection device.',
    'This cartridge also contains Version A, 2002.04.05 MASTER VER. A Version A chooser result does not imply a different cartridge digest.',
    'Other sets such as ddp3, ddpdoj, ddpdoja, ddpdojb, ddpdojp, ddpdojblka, ddpdojblkb, and ddpdojblkbl are not assigned by digest until exact alternate checksums are tracked.',
  ],
  accepted: ddpdojMembers,
  alternateForms: Object.freeze([
    member(null, 6291456,
      '4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c',
      'Decrypted combined 6 MiB maincpu region', {
        classification: 'ddpdoj-decrypted-maincpu',
        satisfiesNames: ['ddb10_10_8_434f.u45', 'ddp3_bios.u37'],
        note: 'Accepted as a separately documented program form. It replaces both the raw encrypted u45 member and ddp3_bios.u37; supply the other eight graphics, sound, text, and NVRAM members.',
      }),
  ]),
});

export const GAME_CATALOGUE = Object.freeze({ batman, gradius, ddpdoj });
export const GAME_IDS = Object.freeze(Object.keys(GAME_CATALOGUE));

export function expectedIdentities(gameId) {
  const game = GAME_CATALOGUE[gameId];
  if (!game) throw new RangeError(`Unknown game id ${gameId}`);
  return game.accepted;
}
