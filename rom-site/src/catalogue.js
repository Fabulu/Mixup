// Hand-audited cartridge identities accepted by the asset-free setup page.
// Digests are metadata only. No cartridge bytes are stored in this tree.

export const CATALOGUE_PROVENANCE = Object.freeze({
  batman: 'games/batman/game.json; SHA-256 independently measured from the verified ignored local image on 2026-08-23',
  gradius: 'games/gradius/game.json and games/gradius/README.md; SHA-256 independently measured from the verified ignored local image on 2026-08-23',
  ddpdoj: 'games/ddpdoj/rip/assets/manifest.json and games/ddpdoj/NOTES-machine.md; generated manifest values transcribed into this tracked catalogue on 2026-08-23',
  ddpdojDecrypted: 'games/ddpdoj/README.md, decrypted combined maincpu image measurement',
  ddpdojAlternates: 'MAME 0.289 src/mame/igs/pgm.cpp ROM_START and GAME declarations, read 2026-08-23',
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
    'Supply the complete raw Game Boy cartridge image directly or inside a ZIP or 7z archive.',
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
    'Supply the complete iNES file directly or inside a ZIP or 7z archive, including its 16-byte header rather than split PRG or CHR files.',
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

const knownMameMember = (name, size, sha1, crc32, set, region, revision, inputForm) =>
  Object.freeze({ name, size, sha1, crc32, set, region, revision, inputForm });

const ddpdojKnownAlternates = Object.freeze([
  knownMameMember('ddp3_v101_16m.u36', 0x200000,
    '59c1a76243e587c07215c8a76649401ef0bff7c7', 'fba2180e', 'ddp3', 'World',
    'DoDonPachi III, 2002.05.15 Master Ver',
    'Raw MAME 68k program member; ROM_LOAD16_WORD_SWAP'),
  knownMameMember('ddp3_v101.u36', 0x200000,
    'f18d791c034b0a3d85888a92fb5d326ee3deb04f', '195b5c1e', 'ddpdoj', 'Japan',
    '2002.04.05.Master Ver, 68k label V101',
    'Raw MAME 68k program member; ROM_LOAD16_WORD_SWAP'),
  knownMameMember('ddp3_d_d_1_0.u36', 0x200000,
    '4c24ea206140863d456179750366921442e1d2b8', '5d3f85ba', 'ddpdoja', 'Japan',
    '2002.04.05.Master Ver, 68k label V100',
    'Raw MAME 68k program member; ROM_LOAD16_WORD_SWAP'),
  knownMameMember('dd_v100.u36', 0x200000,
    'aca2fe35ba0ab3628900fa2aba2d22fc4fd7046d', '7da0c1e4', 'ddpdojb', 'Japan',
    '2002.04.05 Master Ver',
    'Raw MAME 68k program member; ROM_LOAD16_WORD_SWAP'),
  knownMameMember('pgmbios.u20.27c210', 0x020000,
    '025a9f2bb64887699bf7ccab0f2ccfc55c3ad75c', '1d2a7c15', 'ddpdojp', 'Japan',
    '2002.04.05 Master Ver, location test',
    'Location-test split BIOS member; ROM_LOAD16_WORD_SWAP'),
  knownMameMember('ca008.cod_prom.u13.27c322', 0x400000,
    'c4c5425a2455cb95555d94bbf8afc83cf0b140e8', '2ba7fa3b', 'ddpdojp', 'Japan',
    '2002.04.05 Master Ver, location test',
    'Location-test split 68k program member; ROM_LOAD16_WORD_SWAP'),
  knownMameMember('ddb_1dot.u45', 0x200000,
    '91abc7fc4722f3d01d76a4c1ae14c4132e4e576c', '265f26cd', 'ddpdojblka', 'Japan',
    '2002.10.07.Black Ver, older',
    'Raw MAME 68k program member; ROM_LOAD16_WORD_SWAP'),
  knownMameMember('ddb10.u45', 0x200000,
    '9a432e5e1ebe61aafd737b6acc905653e5af0d38', '72b35510', 'ddpdojblkb', 'Japan',
    '2002.10.07 Black Ver',
    'Raw MAME 68k program member; ROM_LOAD16_WORD_SWAP'),
  knownMameMember('ddp3blk_defaults.nv', 0x020000,
    '5b80d3c4c764895c40953a66161d4dd84f742604', 'a1651904',
    'ddpdojblka or ddpdojblkb', 'Japan',
    'Black Label alternate default NVRAM, shared by the older and undotted sets',
    'Extracted MAME default NVRAM member'),
  knownMameMember('ddp_doj_u1.bin', 0x400000,
    '187c37e5319395e36a1cf3626b53e08df615cc0c', 'eb4ab06a', 'ddpdojblkbl', 'Japan',
    '2002.10.07 Black Ver., bootleg Knights of Valour Super Heroes conversion',
    'Bootleg combined 68k program member; ROM_LOAD16_WORD_SWAP'),
  knownMameMember('b04401w064_corrupt.u1', 0x800000,
    'eef1cd566bc70ebf45f047e56026803d5c1dac43', '8cbff066', 'ddpdojblkbl', 'Japan',
    '2002.10.07 Black Ver., bootleg Knights of Valour Super Heroes conversion',
    'Bootleg corrupt bitmap member recorded by MAME'),
]);

const ddpdoj = Object.freeze({
  id: 'ddpdoj',
  title: 'DoDonPachi DaiOuJou Black Label',
  region: 'Japan',
  revision: 'Black Label Version B, 2002.10.07 BLACK VER',
  set: 'ddpdojblk',
  notes: [
    'Supply the ten MAME members listed below directly, inside a ZIP, or inside a 7z archive.',
    'ddb10_10_8_434f.u45 is the raw encrypted program member. MAME loads it with 16-bit word swapping and decrypts it in place.',
    'The protection ROM is undumped. MAME simulates the protection device.',
    'This cartridge also contains Version A, 2002.04.05 MASTER VER. A Version A chooser result does not imply a different cartridge digest.',
    'MAME SHA-1 and CRC32 identities distinguish ddp3, ddpdoj, ddpdoja, ddpdojb, ddpdojp, ddpdojblka, ddpdojblkb, and ddpdojblkbl without assigning an unknown digest to a guessed set.',
  ],
  accepted: ddpdojMembers,
  knownAlternates: ddpdojKnownAlternates,
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
