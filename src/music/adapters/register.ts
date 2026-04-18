/**
 * Central registration point for provider adapters. Importing this file
 * (side-effect import) guarantees every adapter has called
 * `registerAdapter()` before anyone calls `getAdapter()`.
 *
 * Phase 3: Spotify + Apple Music. YouTube was dropped — rights holders
 * (UMG in particular) block embedded playback of major catalog tracks
 * via the IFrame API, so there's no reliable path to a demo.
 */

import './spotify';
import './spotify-connect';
import './apple';
import './apple-connect';
