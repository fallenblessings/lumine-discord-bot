import Base = require('../../core/module/base');
import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');

type ModuleCommand = {
    name: string;
    type: string;
    description: string;
    usage: string;
    aliases: string[];
    subcommands?: { name: string; description: string }[];
};

type ModuleInfo = {
    key: string;
    title: string;
    description: string;
    commands: ModuleCommand[] | null;
};

const MODULES: ModuleInfo[] = [
    {
        key: 'aim-assist',
        title: 'combat-aim-assist',
        description: 'Toggles aim assist and allows configuration of targeting behavior.',
        commands: [
            {
                name: 'aimassist',
                type: 'input',
                description: 'Toggles aim assist and accepts configuration parameters.',
                usage: '[range] [require_click] [only_weapons] [horizontal_range] [vertical_range] [include_mobs]',
                aliases: ['aa', 'aim']
            }
        ]
    },
    {
        key: 'auto-click',
        title: 'combat-auto-click',
        description: 'Configures automatic clicking speed for the player.',
        commands: [
            {
                name: 'autoclick',
                type: 'input',
                description: 'Set a speed at which the player click.',
                usage: '(CPS)',
                aliases: ['auto']
            }
        ]
    },
    {
        key: 'auto-critical',
        title: 'combat-auto-critical',
        description: 'Automatically performs critical hits.',
        commands: [
            {
                name: 'autocritical',
                type: 'toggle',
                description: 'Automatically performs critical hits.',
                usage: 'none (toggle command)',
                aliases: ['autocrit']
            }
        ]
    },
    {
        key: 'auto-crystal',
        title: 'combat-auto-crystal',
        description: 'Automatically places and attacks end crystals.',
        commands: [
            {
                name: 'autocrystal',
                type: 'toggle',
                description: 'Automatically places and attacks end crystals.',
                usage: 'none (toggle command)',
                aliases: ['ca']
            }
        ]
    },
    {
        key: 'auto-switch',
        title: 'combat-auto-switch',
        description: 'Automatically switches between two hotbar slots on each attack.',
        commands: [
            {
                name: 'autoswitch',
                type: 'input',
                description: 'Automatically switches between two hotbar slots on each attack.',
                usage: '(slot one) (slot two)',
                aliases: ['switch']
            }
        ]
    },
    {
        key: 'hitbox',
        title: 'combat-hitbox',
        description: 'Adjusts hitbox scale for target interaction.',
        commands: [
            {
                name: 'hitbox',
                type: 'input',
                description: 'Set hitbox scale.',
                usage: '(Scale)',
                aliases: []
            }
        ]
    },
    {
        key: 'kill-aura',
        title: 'combat-kill-aura',
        description: 'Enables an auto-attack aura for nearby targets.',
        commands: [
            {
                name: 'killaura',
                type: 'input',
                description: 'Have an aura that kills players.',
                usage: '(CPS) (Reach)',
                aliases: ['aura', 'ka']
            }
        ]
    },
    {
        key: 'mace-damage',
        title: 'combat-mace-damage',
        description: 'Automatically performs smash hits with a mace.',
        commands: [
            {
                name: 'macedamage',
                type: 'toggle',
                description: 'Automatically performs smash hits with mace.',
                usage: 'none (toggle command)',
                aliases: ['macedmg']
            }
        ]
    },
    {
        key: 'reach',
        title: 'combat-reach',
        description: 'Configures maximum reach distance.',
        commands: [
            {
                name: 'reach',
                type: 'input',
                description: 'Set maximum reach.',
                usage: '(Reach)',
                aliases: []
            }
        ]
    },
    {
        key: 'tp-aura',
        title: 'combat-tp-aura',
        description: 'Teleports behind targets automatically during attacks.',
        commands: [
            {
                name: 'tpaura',
                type: 'input',
                description: 'Teleport behind targets automatically.',
                usage: '(CPS) (Reach)',
                aliases: ['tpa']
            }
        ]
    },
    {
        key: 'trigger-bot',
        title: 'combat-trigger-bot',
        description: 'Automatically attacks when aiming at entities.',
        commands: [
            {
                name: 'triggerbot',
                type: 'input',
                description: 'Automatically attack when looking at entities.',
                usage: '(CPS) (Reach)',
                aliases: ['trigger']
            }
        ]
    },
    {
        key: 'air-jump',
        title: 'movement-air-jump',
        description: 'Allows players to jump while in the air.',
        commands: [
            {
                name: 'airjump',
                type: 'toggle',
                description: 'Allows players to jump while in the air.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'anti-immobile',
        title: 'movement-anti-immobile',
        description: 'Ignores immobility restrictions.',
        commands: [
            {
                name: 'antiimmobile',
                type: 'toggle',
                description: 'Ignore immobility restrictions.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'anti-knockback',
        title: 'movement-anti-knockback',
        description: 'Refuses server-side knockback.',
        commands: [
            {
                name: 'antiknockback',
                type: 'toggle',
                description: 'Refuse server-side knockback.',
                usage: 'none (toggle command)',
                aliases: ['antikb']
            }
        ]
    },
    {
        key: 'bunny-hop',
        title: 'movement-bunny-hop',
        description: 'Enables bunny hop style movement.',
        commands: [
            {
                name: 'bunnyhop',
                type: 'input',
                description: 'Allows players to move like a bunny.',
                usage: '(Multiplier) | (Blank))',
                aliases: ['bhop']
            }
        ]
    },
    {
        key: 'fly',
        title: 'movement-fly',
        description: 'Allows free flight with configurable speeds.',
        commands: [
            {
                name: 'fly',
                type: 'input',
                description: 'Fly around the server.',
                usage: '(Horizontal Speed) (Vertical Speed)',
                aliases: ['flight']
            }
        ]
    },
    {
        key: 'free-cam',
        title: 'movement-free-cam',
        description: 'Enables free movement camera mode.',
        commands: [
            {
                name: 'freecam',
                type: 'toggle',
                description: 'Enables free movement camera.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'glide',
        title: 'movement-glide',
        description: 'Configures gliding behavior in the air.',
        commands: [
            {
                name: 'glide',
                type: 'input',
                description: 'Glide through the air.',
                usage: '(Glide Speed) (Descent Rate) | (Blank)',
                aliases: []
            }
        ]
    },
    {
        key: 'jump-fly',
        title: 'movement-jump-fly',
        description: 'Enables flying by jumping.',
        commands: [
            {
                name: 'jumpfly',
                type: 'toggle',
                description: 'Allows players to fly by jumping.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'motion-fly',
        title: 'movement-motion-fly',
        description: 'Motion-based flight via SetMotion packets.',
        commands: [
            {
                name: 'motionfly',
                type: 'input',
                description: 'Motion fly using SetMotion packets.',
                usage: '(Horizontal Speed) (Vertical Speed) [Glide Speed]',
                aliases: ['mfly']
            }
        ]
    },
    {
        key: 'no-clip',
        title: 'movement-no-clip',
        description: 'Allows noclip movement.',
        commands: [
            {
                name: 'noclip',
                type: 'toggle',
                description: 'Lets players noclip.',
                usage: 'none (toggle command)',
                aliases: ['phase']
            }
        ]
    },
    {
        key: 'refuse-tp',
        title: 'movement-refuse-tp',
        description: 'Automatically denies teleport requests.',
        commands: [
            {
                name: 'refusetp',
                type: 'toggle',
                description: 'Automatically denies teleport requests.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'speed',
        title: 'movement-speed',
        description: 'Multiplies walk, fly, and vertical fly speeds.',
        commands: [
            {
                name: 'speed',
                type: 'input',
                description: "Multiplies the player's walk, fly and vertical fly speed.",
                usage: '(Multiplier)',
                aliases: []
            }
        ]
    },
    {
        key: 'spider',
        title: 'movement-spider',
        description: 'Enables wall-climbing when colliding horizontally.',
        commands: [
            {
                name: 'spider',
                type: 'toggle',
                description: 'Enables wall-climbing when colliding horizontally.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'stash',
        title: 'movement-stash',
        description: 'Finds and teleports to nearby containers.',
        commands: [
            {
                name: 'find',
                type: 'input',
                description: 'Teleports to the nearest container block.',
                usage: '(Radius)',
                aliases: []
            }
        ]
    },
    {
        key: 'teleport',
        title: 'movement-teleport',
        description: 'Teleports the player to specific coordinates.',
        commands: [
            {
                name: 'teleport',
                type: 'input',
                description: 'Teleports the player.',
                usage: '(X Y Z)',
                aliases: ['tp']
            }
        ]
    },
    {
        key: 'teleport-tap',
        title: 'movement-teleport-tap',
        description: 'Teleports to the block you just tapped.',
        commands: [
            {
                name: 'teleporttap',
                type: 'toggle',
                description: 'Teleport to the block you just tapped.',
                usage: 'none (toggle command)',
                aliases: ['tptap']
            }
        ]
    },
    {
        key: 'timer',
        title: 'movement-timer',
        description: 'Simulates faster ticks to speed the player up.',
        commands: [
            {
                name: 'timer',
                type: 'input',
                description: 'Speed the player up by simulating ticks.',
                usage: '(Speed) | (Stop)',
                aliases: []
            }
        ]
    },
    {
        key: 'top',
        title: 'movement-top',
        description: 'Teleports to the highest block at current X/Z.',
        commands: [
            {
                name: 'top',
                type: 'input',
                description: 'Teleports to the highest block at your X, Z coordinates.',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'velocity',
        title: 'movement-velocity',
        description: "Modifies the player's knockback scale.",
        commands: [
            {
                name: 'velocity',
                type: 'input',
                description: 'Modify the players knockback scale.',
                usage: '(Scale)',
                aliases: ['kb', 'velo']
            }
        ]
    },
    {
        key: 'network',
        title: 'network',
        description: 'Provides network diagnostics commands.',
        commands: [
            {
                name: 'ping',
                type: 'static',
                description: 'Displays network latency information.',
                usage: 'none',
                aliases: []
            },
            {
                name: 'network',
                type: 'static',
                description: 'Shows detailed network statistics.',
                usage: 'none',
                aliases: []
            },
            {
                name: 'lag',
                type: 'static',
                description: 'Displays lag information and diagnostics.',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'no-packet',
        title: 'network-no-packet',
        description: 'Toggles the ability to send packets.',
        commands: [
            {
                name: 'nopacket',
                type: 'toggle',
                description: 'Disable the ability to send packets.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'packet-log',
        title: 'network-packet-log',
        description: 'Logs packets based on configurable filters and sides.',
        commands: [
            {
                name: 'packetlog',
                type: 'input',
                description: 'Logs packets.',
                usage: '(Add) (Id) | (Remove) (Id) | (Show) | (Mode) (Blacklist, Whitelist) | (Side) (Both, Client, Server)',
                aliases: [],
                subcommands: [
                    { name: 'add', description: 'Adds a packet ID to the log list.' },
                    { name: 'remove', description: 'Removes a packet ID from the log list.' },
                    { name: 'show', description: 'Displays the current packet list and mode.' },
                    { name: 'mode', description: 'Sets packet list mode (include/exclude).' },
                    { name: 'side', description: 'Sets which side(s) to log (client, server, both).' }
                ]
            }
        ]
    },
    {
        key: 'anon-command',
        title: 'utility-anon-command',
        description: 'Runs a command anonymously (friends/realms only).',
        commands: [
            {
                name: 'anoncommand',
                type: 'input',
                description: 'Run a command anonymously (ONLY WORKS IN FRIENDS AND REALMS).',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'anti-bot',
        title: 'utility-anti-bot',
        description: 'Prevents targeting of non-player entities.',
        commands: [
            {
                name: 'antibot',
                type: 'toggle',
                description: 'Prevents targeting of non players.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'anti-debuff',
        title: 'utility-anti-debuff',
        description: 'Removes and prevents debuff effects.',
        commands: [
            {
                name: 'antidebuff',
                type: 'toggle',
                description: 'Removes and prevents debuff effects.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'auto-armor',
        title: 'utility-auto-armor',
        description: 'Automatically equips the best armor.',
        commands: [
            {
                name: 'autoarmor',
                type: 'input',
                description: 'Automatically equips best armor.',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'auto-hand',
        title: 'utility-auto-hand',
        description: 'Automatically equips the best item for a block/entity.',
        commands: [
            {
                name: 'autohand',
                type: 'input',
                description: 'Automatically equips best item for block/entity.',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'auto-pot',
        title: 'utility-auto-pot',
        description: 'Automatically uses healing splash potions when health is low.',
        commands: [
            {
                name: 'autopot',
                type: 'input',
                description: 'Automatically uses splash potions of healing when health is low.',
                usage: '[Health]',
                aliases: []
            }
        ]
    },
    {
        key: 'auto-shield',
        title: 'utility-auto-shield',
        description: 'Automatically equips shields.',
        commands: [
            {
                name: 'autoshield',
                type: 'input',
                description: 'Automatically equips shields.',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'auto-totem',
        title: 'utility-auto-totem',
        description: 'Automatically equips totems.',
        commands: [
            {
                name: 'autototem',
                type: 'input',
                description: 'Automatically equips totems.',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'autolog',
        title: 'utility-autolog',
        description: 'Disconnects or runs a command when health falls below a threshold.',
        commands: [
            {
                name: 'autolog',
                type: 'input',
                description: 'Disconnects the player or executes a command if their health is below a certain value.',
                usage: '(Health) [Command]',
                aliases: []
            }
        ]
    },
    {
        key: 'automine',
        title: 'utility-automine',
        description: 'Auto mines blocks using pathfinding.',
        commands: [
            {
                name: 'automine',
                type: 'input',
                description: 'Auto mine blocks using pathfinding.',
                usage: '(blockname) (auto_eat) (count)',
                aliases: []
            }
        ]
    },
    {
        key: 'bind',
        title: 'utility-bind',
        description: 'Manages action binds that trigger commands after action sequences.',
        commands: [
            {
                name: 'bind',
                type: 'input',
                description: 'Manage action binds.',
                usage: 'list | clear <command> | add <command> | time <ms>',
                aliases: [],
                subcommands: [
                    { name: 'list', description: 'Lists current binds and their action sequences.' },
                    { name: 'clear', description: 'Removes binds for a specific command.' },
                    { name: 'add', description: 'Starts or finishes recording an action sequence for a command.' },
                    { name: 'time', description: 'Sets the time limit (ms) between bound actions.' }
                ]
            }
        ]
    },
    {
        key: 'command-names',
        title: 'utility-command-names',
        description: 'Displays command names available to the player.',
        commands: [
            {
                name: 'commandnames',
                type: 'static',
                description: 'Displays command names.',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'container-stealer',
        title: 'utility-container-stealer',
        description: 'Automatically steals items from containers.',
        commands: [
            {
                name: 'containerstealer',
                type: 'toggle',
                description: 'Automatically steals items from containers.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'coordinates',
        title: 'utility-coordinates',
        description: "Displays the player's current coordinates.",
        commands: [
            {
                name: 'coordinates',
                type: 'static',
                description: 'Displays your current coordinates.',
                usage: 'none',
                aliases: ['coords', 'pos']
            }
        ]
    },
    {
        key: 'damage',
        title: 'utility-damage',
        description: 'Damages the player.',
        commands: [
            {
                name: 'damage',
                type: 'static',
                description: 'Damage yourself!',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'death-position',
        title: 'utility-death-position',
        description: 'Tracks recent death positions for the current session.',
        commands: [
            {
                name: 'deathposition',
                type: 'input',
                description: 'View your last death positions that have occurred during your current session.',
                usage: '(Number)',
                aliases: [],
                subcommands: [
                    { name: 'teleport', description: 'Teleports to the specified death position number.' },
                    { name: 'path', description: 'Starts pathfinding to the specified death position number.' }
                ]
            }
        ]
    },
    {
        key: 'debug',
        title: 'utility-debug',
        description: 'Displays debug information.',
        commands: [
            {
                name: 'debug',
                type: 'static',
                description: 'Displays debug information.',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'despawner',
        title: 'utility-despawner',
        description: 'Prevents selected entity types from being spawned.',
        commands: [
            {
                name: 'despawner',
                type: 'input',
                description: 'Prevents entities from being spawned.',
                usage: '(add|remove|list) [entity type]',
                aliases: [],
                subcommands: [
                    { name: 'add', description: 'Adds an entity type to the despawner list.' },
                    { name: 'remove', description: 'Removes an entity type from the despawner list.' },
                    { name: 'list', description: 'Lists all entity types currently blocked.' }
                ]
            }
        ]
    },
    {
        key: 'disabler',
        title: 'utility-disabler',
        description: 'Configures anticheat disabler settings.',
        commands: [
            {
                name: 'disabler',
                type: 'input',
                description: 'Disable the anticheat.',
                usage: '(mode)',
                aliases: ['config', 'mode']
            }
        ]
    },
    {
        key: 'fake-op',
        title: 'utility-fake-op',
        description: 'Pretends to grant operator permissions.',
        commands: [
            {
                name: 'fakeop',
                type: 'toggle',
                description: 'Pretends to grant operator permissions.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'fast-eat',
        title: 'utility-fast-eat',
        description: 'Allows for faster eating.',
        commands: [
            {
                name: 'fasteat',
                type: 'toggle',
                description: 'Allows for faster eating.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'freeze',
        title: 'utility-freeze',
        description: 'Freezes all players on the server (friends/realms only).',
        commands: [
            {
                name: 'freeze',
                type: 'input',
                description: 'Freeze all the players in the server (REALMS AND FRIENDS ONLY).',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'friends',
        title: 'utility-friends',
        description: 'Manages the friends list.',
        commands: [
            {
                name: 'friends',
                type: 'input',
                description: 'Manage friends list.',
                usage: '(Add) (Name) | (Remove) (Name) | (List)',
                aliases: [],
                subcommands: [
                    { name: 'add', description: 'Adds a player name to the friends list.' },
                    { name: 'remove', description: 'Removes a player name from the friends list.' },
                    { name: 'list', description: 'Lists all current friends.' }
                ]
            }
        ]
    },
    {
        key: 'game-mode',
        title: 'utility-game-mode',
        description: "Changes the player's game mode.",
        commands: [
            {
                name: 'gamemode',
                type: 'input',
                description: "Changes player's game mode.",
                usage: '(A, C, D, S, Spec, Server)',
                aliases: []
            }
        ]
    },
    {
        key: 'help',
        title: 'utility-help',
        description: 'Opens the help browser.',
        commands: [
            {
                name: 'help',
                type: 'static',
                description: 'Open the help browser.',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'invis',
        title: 'utility-invis',
        description: 'Makes your player invisible by swapping to an invisible skin.',
        commands: [
            {
                name: 'invisible',
                type: 'static',
                description: 'Makes your player invisible by changing your skin to an invisible one.',
                usage: 'none',
                aliases: ['invis']
            }
        ]
    },
    {
        key: 'mod-alerts',
        title: 'utility-mod-alerts',
        description: 'Configures moderator alerts for server staff.',
        commands: [
            {
                name: 'modalerts',
                type: 'input',
                description: 'Configure mod alerts for server moderators.',
                usage: '(Disconnect)',
                aliases: []
            }
        ]
    },
    {
        key: 'nick',
        title: 'utility-nick',
        description: 'Changes your in-game name (visual only on servers).',
        commands: [
            {
                name: 'nick',
                type: 'input',
                description: 'Change your in-game name (visual only in servers).',
                usage: '(Name)',
                aliases: []
            }
        ]
    },
    {
        key: 'path',
        title: 'utility-path',
        description: 'Provides pathfinding controls.',
        commands: [
            {
                name: 'path',
                type: 'input',
                description: 'Pathfinding controls.',
                usage: '(XZ|XYZ|STOP)',
                aliases: [],
                subcommands: [
                    { name: 'xz', description: 'Finds a path to X/Z coordinates (ground-level).' },
                    { name: 'xyz', description: 'Finds a path to X/Y/Z coordinates.' },
                    { name: 'stop', description: 'Stops the current pathfinding session.' }
                ]
            }
        ]
    },
    {
        key: 'permissions',
        title: 'utility-permissions',
        description: 'Displays the current permission set.',
        commands: [
            {
                name: 'permissions',
                type: 'static',
                description: 'Manage permissions.',
                usage: 'none',
                aliases: ['perms']
            }
        ]
    },
    {
        key: 'read-nbt',
        title: 'utility-read-nbt',
        description: 'Reads NBT data from the held item.',
        commands: [
            {
                name: 'readnbt',
                type: 'static',
                description: 'Displays NBT-Data from the players hand held item.',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'seed',
        title: 'utility-seed',
        description: 'Displays the current world seed.',
        commands: [
            {
                name: 'seed',
                type: 'static',
                description: 'See the current world seed.',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'skin',
        title: 'utility-skin',
        description: 'Saves or applies player skins.',
        commands: [
            {
                name: 'skin',
                type: 'input',
                description: 'Save or apply a player skin.',
                usage: '(Save) (Player) (Default) | (Save) (Player) (Name) | (Load) (Name) | (List)',
                aliases: [],
                subcommands: [
                    { name: 'save', description: "Saves a player's skin (default or named)." },
                    { name: 'default', description: "Saves a player's skin as the default entry." },
                    { name: 'load', description: 'Applies a saved skin by name.' },
                    { name: 'list', description: 'Lists saved skins.' }
                ]
            }
        ]
    },
    {
        key: 'spam',
        title: 'utility-spam',
        description: 'Spams a server with messages or commands.',
        commands: [
            {
                name: 'spam',
                type: 'input',
                description: 'Spam a server with messages.',
                usage: '(Amount) (Frequency) (Message) | (Stop)',
                aliases: [],
                subcommands: [
                    { name: 'stop', description: 'Stops all running spam tasks.' }
                ]
            }
        ]
    },
    {
        key: 'tpmine',
        title: 'utility-tpmine',
        description: 'Teleports to nearby blocks when crouching.',
        commands: [
            {
                name: 'tpmine',
                type: 'input',
                description: 'Teleport to nearby blocks when crouching.',
                usage: '(block)',
                aliases: []
            }
        ]
    },
    {
        key: 'unbreakable',
        title: 'utility_unbreakable',
        description: 'Sets the held item as unbreakable (friends/realms only).',
        commands: [
            {
                name: 'unbreakable',
                type: 'input',
                description: 'Set as unbreakable the item you are holding (REALMS AND FRIENDS ONLY).',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'welcome',
        title: 'utility-welcome',
        description: 'Sends a welcome title and changelog message on connect.',
        commands: null
    },
    {
        key: 'anti-forced-packs',
        title: 'visual-anti-forced-packs',
        description: 'Enables skipping forced resource packs from servers.',
        commands: [
            {
                name: 'antiforcedpacks',
                type: 'toggle',
                description: 'Enable the option to skip forced resource packs from servers.',
                usage: 'none (toggle command)',
                aliases: ['nopacks']
            }
        ]
    },
    {
        key: 'anti-weather',
        title: 'visual-anti-weather',
        description: 'Disables weather effects.',
        commands: [
            {
                name: 'antiweather',
                type: 'toggle',
                description: 'Disables weather effects.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'array-list',
        title: 'visual-array-list',
        description: 'Shows active modules on the HUD.',
        commands: [
            {
                name: 'arraylist',
                type: 'toggle',
                description: 'Shows active modules on the HUD.',
                usage: 'none (toggle command)',
                aliases: ['list', 'hud']
            }
        ]
    },
    {
        key: 'chest-esp',
        title: 'visual-chest-esp',
        description: 'Draws ESP on storage blocks.',
        commands: [
            {
                name: 'chestesp',
                type: 'toggle',
                description: 'Draws ESP on storage blocks.',
                usage: 'none (toggle command)',
                aliases: ['storageesp']
            }
        ]
    },
    {
        key: 'click-ui',
        title: 'visual-click-ui',
        description: 'Enables the click UI.',
        commands: [
            {
                name: 'clickui',
                type: 'static',
                description: 'Enable the click UI.',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'dih',
        title: 'visual-dih',
        description: "Applies a Dih to your player's skin.",
        commands: [
            {
                name: 'dih',
                type: 'toggle',
                description: "Applies a Dih to your player's skin.",
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'entity-esp',
        title: 'visual-entity-esp',
        description: 'Draws ESP identifiers on entities.',
        commands: [
            {
                name: 'entityesp',
                type: 'input',
                description: 'Draws ESP identifier on entities.',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'fullbright',
        title: 'visual-fullbright',
        description: 'Allows the player to see in dark places.',
        commands: [
            {
                name: 'fullbright',
                type: 'toggle',
                description: 'Allows player to see in dark places.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'no-hurtcam',
        title: 'visual-no-hurtcam',
        description: 'Disables the hurt camera effect.',
        commands: [
            {
                name: 'nohurtcam',
                type: 'toggle',
                description: 'Disables hurtcam.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'no-invisible',
        title: 'visual-no-invisible',
        description: 'Allows you to see invisible entities.',
        commands: [
            {
                name: 'noinvisible',
                type: 'toggle',
                description: 'Allows you to see invisible entities.',
                usage: 'none (toggle command)',
                aliases: ['noinvis']
            }
        ]
    },
    {
        key: 'search',
        title: 'visual-search',
        description: 'Searches loaded chunks for specific blocks.',
        commands: [
            {
                name: 'search',
                type: 'input',
                description: 'Search loaded chunks for a specific block (NOT recommended for lots of blocks).',
                usage: '[block] [block states] [area]',
                aliases: ['scan', 'xray']
            }
        ]
    },
    {
        key: 'tracer',
        title: 'visual-tracer',
        description: 'Draws tracer lines from your head to entities.',
        commands: [
            {
                name: 'tracer',
                type: 'input',
                description: 'Draws tracer lines from your head to entities.',
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'bed-finder',
        title: 'world-bed-finder',
        description: 'Locates player beds across the world.',
        commands: [
            {
                name: 'bedfinder',
                type: 'toggle',
                description: 'Locate players beds across the world.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'fast-interact',
        title: 'world-fast-interact',
        description: 'Allows quick interaction with blocks.',
        commands: [
            {
                name: 'fastinteract',
                type: 'toggle',
                description: 'Allows you to quickly interact with blocks.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'insta-break',
        title: 'world-insta-break',
        description: 'Allows instant mining of minable blocks.',
        commands: [
            {
                name: 'instabreak',
                type: 'toggle',
                description: 'Allows players to instantly mine every minable block.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'no-fall',
        title: 'world-no-fall',
        description: 'Prevents fall damage.',
        commands: [
            {
                name: 'nofall',
                type: 'toggle',
                description: 'Prevents fall damage.',
                usage: 'none (toggle command)',
                aliases: []
            }
        ]
    },
    {
        key: 'nuker',
        title: 'world-nuker',
        description: "Breaks blocks in the player's area.",
        commands: [
            {
                name: 'nuker',
                type: 'input',
                description: "Breaks blocks in the player's area.",
                usage: 'none',
                aliases: []
            }
        ]
    },
    {
        key: 'scaffold',
        title: 'world-scaffold',
        description: 'Places blocks below the player as they walk.',
        commands: [
            {
                name: 'scaffold',
                type: 'toggle',
                description: 'Toggles scaffold mode, which places blocks below the player as they walk.',
                usage: 'none (toggle command)',
                aliases: ['scaf']
            }
        ]
    }
];

class ModuleInfoCommand extends Base {
    private groupedModules: Record<string, ModuleInfo[]> = {};

    constructor() {
        super('lumine_module', 'Provides module info for the in-game modules list');
        this.initializeCommands();
    }

    initializeCommands(): void {
        this.groupedModules = this.buildGroupedModules();

        const builder = new SlashCommandBuilder()
            .setName('lumine_module')
            .setDescription('Get information about a module')
            .setIntegrationTypes([0, 1])
            .setContexts([0, 1, 2]);

        this.addModuleChoicesOption(builder, 'combat', 'Combat modules');
        this.addModuleChoicesOption(builder, 'movement', 'Movement modules');
        this.addModuleChoicesOption(builder, 'network', 'Network modules');
        this.addModuleChoicesOption(builder, 'utility', 'Utility modules');
        this.addModuleChoicesOption(builder, 'visual', 'Visual modules');
        this.addModuleChoicesOption(builder, 'world', 'World modules');

        this.registerCommand({
            data: builder,
            execute: this.executeInfo.bind(this)
        });
    }

    async executeInfo(interaction: ChatInputCommandInteraction): Promise<void> {
        const selected = this.getSelectedModuleKey(interaction);
        if (!selected) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('Module not selected')
                .setDescription('Pick a module from one of the module options (combat, movement, utility, etc.).')
                .setColor(EMBED_COLOR_ERROR);

            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            return;
        }

        const moduleInfo = MODULES.find(moduleEntry => moduleEntry.key === selected);

        if (!moduleInfo) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('Module not found')
                .setDescription('That module could not be found in the info list.')
                .setColor(EMBED_COLOR_ERROR);

            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            return;
        }

        const embed = this.buildModuleEmbed(moduleInfo);
        await interaction.reply({ embeds: [embed] });
    }

    private buildModuleEmbed(moduleInfo: ModuleInfo): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setTitle(`Module Info: ${moduleInfo.title.substring(moduleInfo.title.indexOf('-') + 1)}`)
            .setDescription(moduleInfo.description)
            .setColor(EMBED_COLOR_PRIMARY);

        if (!moduleInfo.commands || moduleInfo.commands.length === 0) {
            embed.addFields({
                name: 'Commands',
                value: 'None (module runs automatically on connect).'
            });
        } else {
            moduleInfo.commands.forEach(command => {
                const aliases = command.aliases.length > 0 ? command.aliases.join(', ') : 'none';
                const subcommands = command.subcommands && command.subcommands.length > 0
                    ? command.subcommands.map(sub => `- ${sub.name}: ${sub.description}`).join('\n')
                    : 'none';
                const value = [
                    `Type: ${command.type}`,
                    `Description: ${command.description}`,
                    `Usage: /.${command.name} ${command.usage}`,
                    `Aliases: ${aliases}`,
                    `Subcommands: ${subcommands}`
                ].join('\n');

                embed.addFields({
                    name: `/.${command.name}`,
                    value
                });
            });
        }

        return embed;
    }

    private getCategoryForTitle(title: string): string {
        if (title.startsWith('combat-')) return 'combat';
        if (title.startsWith('movement-')) return 'movement';
        if (title.startsWith('network-')) return 'network';
        if (title.startsWith('utility-')) return 'utility';
        if (title.startsWith('visual-')) return 'visual';
        if (title.startsWith('world-')) return 'world';
        return 'utility';
    }

    private buildGroupedModules(): Record<string, ModuleInfo[]> {
        const grouped: Record<string, ModuleInfo[]> = {
            combat: [],
            movement: [],
            network: [],
            visual: [],
            world: [],
            utility: []
        };

        MODULES.forEach(moduleInfo => {
            const category = this.getCategoryForTitle(moduleInfo.title);
            if (grouped[category]) {
                grouped[category].push(moduleInfo);
            }
        });

        return grouped;
    }

    private addModuleChoicesOption(
        builder: SlashCommandBuilder,
        groupKey: string,
        description: string
    ): void {
        const modules = this.groupedModules[groupKey];
        if (!modules || modules.length === 0) {
            return;
        }

        builder.addStringOption(option => {
            option
                .setName(groupKey.replace(/-/g, '_'))
                .setDescription(description)
                .setRequired(false);

            const limited = modules.slice(0, 25);
            limited.forEach(moduleInfo => {
                option.addChoices({
                    name: moduleInfo.title.substring(moduleInfo.title.indexOf('-') + 1),
                    value: moduleInfo.key
                });
            });

            return option;
        });
    }

    private getSelectedModuleKey(interaction: ChatInputCommandInteraction): string | null {
        const optionKeys = [
            'combat',
            'movement',
            'network',
            'utility',
            'visual',
            'world'
        ];

        const selections = optionKeys
            .map(key => interaction.options.getString(key))
            .filter((value): value is string => Boolean(value));

        if (selections.length !== 1) {
            return null;
        }

        return selections[0].toLowerCase();
    }
}

export = ModuleInfoCommand;
