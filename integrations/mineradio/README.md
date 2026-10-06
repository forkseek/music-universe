# Music World platform bridge

Reference: https://github.com/XxHuberrr/Mineradio-paused/tree/d43de565acabfdc1a9c9820a27e81a98ccbebcef

The unmodified files in `vendor/` are from that revision. Their GPL-3.0-only
license, copyright notices, and upstream third-party notices are included there.
Qishui's security resources retain their respective owners' rights. The vendor
copy includes only platform adapters, official-account authentication, and the
account-authorized audio format decoder, not the reference application's UI.

`worker.cjs` calls NeteaseCloudMusicApi 4.32.0 and the Kugou/Qishui adapters via
private Node IPC. `login.cjs` runs an isolated Electron session for official QQ
and Kugou login, or the reference Qishui Passport QR/security flow. Electron is
updated within the reference's 42.x series. No public bridge HTTP port is opened.
QQ search/playback reuse Music World's existing musicu adapter.

Next handles browser sessions, encrypted per-user credentials, short-lived
playback tickets, URL allowlists, and response shaping. The browser never
receives platform cookies. Login windows have Node integration disabled.

Setup (from the Music World root): `npm install`, then
`node node_modules/electron/install.js`. `npm start` sets the integration root
before entering Next's standalone directory. In development the root defaults
to the current project. `MUSIC_DESKTOP_LOGIN=0` disables local login windows on
remote deployments; the local helper is intended for a loopback-only server.

No developer app key is required for these official-account flows. The optional
Qishui OpenAPI configuration in the upstream module is not used by this bridge.
Search can run without an account where the platform permits it. Playback is
limited by the actual account, territory, trial, and subscription response.

Spotify is intentionally absent: the reference returns PROVIDER_REMOVED.
