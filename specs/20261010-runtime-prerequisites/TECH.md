# External runtime prerequisites

The user requires Node.js and FFmpeg to be installed separately; Sharp remains a packaged dependency.
The CLI currently relies on the Node shebang and checks FFmpeg only through the media service.

The implementation will add a generated POSIX launcher that checks Node availability before entering JavaScript.
Its localized guidance will come from the existing typed messages catalog. Without Node, saved JSON settings
cannot be read; explicit language selection will work, with English as the default. Machine output will use
stable English diagnostic codes. The JavaScript entry will reject Node versions below the existing 22.13 minimum.
The source preview targets POSIX launchers; Windows packaging remains planned.

Business commands will probe the user-selected `FFMPEG_PATH` or `ffmpeg` on PATH with the existing scoped,
five-second media probe before importing business commands or producing outputs. Failure will exit with
installation guidance. Help, version, and settings will remain available without FFmpeg. This user-requested
policy supersedes the original optional-FFmpeg policy for image CLI commands. The library stays independently usable.
No executable will be downloaded or installed automatically. Sharp will remain a normal workspace dependency.

Real subprocess E2E will cover missing Node with an empty PATH, missing FFmpeg, localized guidance, JSON errors,
setup commands, and successful execution with installed prerequisites. Run `pnpm check` and `pnpm test:e2e`.
