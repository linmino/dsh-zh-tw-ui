# Third-party notices

`dsh-zh-tw-ui` itself is MIT (see `LICENSE`). It ships one vendored third-party
file plus the license texts that file requires.

## Vendored file

| | |
|---|---|
| Path | `src/vendor/opencc.full.umd.js` |
| Upstream | [`opencc-js`](https://github.com/nk2028/opencc-js) v1.4.2, file `dist/umd/full.js` |
| Source | <https://cdn.jsdelivr.net/npm/opencc-js@1.4.2/dist/umd/full.js> |
| Size | 1,195,473 bytes |
| SHA-256 | `95B04ABF136D9C28263773BB7D357EAC80B7954D101EFD23C4D09C737D3D379E` |
| License | MIT (`src/vendor/LICENSE-opencc-js.txt`) |

The file is vendored **byte-for-byte unmodified**. `build.mjs` wraps it in an
IIFE and shadows `module` / `exports` / `define` so the UMD build assigns its
namespace to a local variable instead of leaking into the plugin's own exports
or the page's global scope.

Verify the vendored copy:

```sh
node -e "const c=require('crypto'),f=require('fs');console.log(c.createHash('sha256').update(f.readFileSync('src/vendor/opencc.full.umd.js')).digest('hex').toUpperCase())"
# 95B04ABF136D9C28263773BB7D357EAC80B7954D101EFD23C4D09C737D3D379E
```

## OpenCC dictionaries (Apache-2.0)

`opencc-js` embeds dictionary data generated from
[OpenCC](https://github.com/BYVoid/OpenCC), which is licensed under the Apache
License 2.0. The full text is at
`src/vendor/LICENSE-OpenCC-Apache-2.0.txt`, and `opencc-js`'s own inventory of
bundled third-party licenses is kept at
`src/vendor/THIRD-PARTY-LICENSES-opencc-js.md`.

Dictionaries used by this plugin (via the `cn -> twp` conversion):
`STCharacters`, `STPhrases`, `TWPhrases`, `TWVariants`.
