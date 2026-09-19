# Shared race link profile setup

The CrazyGames release used to join incoming race invitations automatically when the tower loaded. A new visitor went straight to the lobby with a default name and outfit. Invitations now wait for the player to enter a name, choose colors, and click **Join race**. Explicit Instant Multiplayer requests without a room still create a host lobby automatically.

The standalone app already waits for confirmation. The CrazyGames source and courier model remain in the separate local release branch. `invite-profile-fix.patch` contains the platform-only change and can be applied from that checkout with:

```sh
git apply --check /path/to/docs/crazygames/invite-profile-fix.patch
git apply /path/to/docs/crazygames/invite-profile-fix.patch
```

Checking the URL directly prevents a mount-order race before React has populated the invited room state. A room parameter takes precedence even when `cgInstant=1` is also present.

## Verification

- Reproduced the old automatic lobby entry with a default Player 2 profile.
- Opened an invitation with fresh browser storage and both room and instant parameters: the name/color form stayed visible, and a host API poll confirmed only one occupied slot.
- Entered Nova QA, selected Summit helmet and Aurora parka, and clicked Join race. The lobby and host response contained the chosen name and outfit, with exactly two players.
- Reloading a normal room invitation still showed setup; Instant Multiplayer without a room still created a host lobby.
- Lint, TypeScript, production build, and all 19 focused CrazyGames/profile/client tests passed.
