import Base = require('../../core/module/base');
import { randomUUID } from 'crypto';
import {
    ActionRowBuilder,
    Attachment,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    Client,
    EmbedBuilder,
    FileUploadBuilder,
    GuildTextBasedChannel,
    Interaction,
    LabelBuilder,
    Message,
    ModalBuilder,
    ModalSubmitInteraction,
    PartialMessage,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');

type IssuesIntakeConfig = {
    guildId: string;
    issuesChannelId: string;
    issuePostChannelId: string;
};

type IssueSubmission = {
    title: string;
    device: string;
    realmOrServer: string;
    whatHappened: string;
    reproduce: string;
    uploads: Attachment[];
};

type PendingIssueSubmission = {
    userId: string;
    createdAt: number;
    referenceId: string;
    submission: IssueSubmission;
};

const DEFAULT_GUILD_ID = '1424798387664064687';
const DEFAULT_ISSUES_CHANNEL_ID = '1488021804948918274';
const DEFAULT_ISSUE_POST_CHANNEL_ID = '1488023799222894783';

const ISSUE_PANEL_BUTTON_ID = 'lumine_issue_panel_button';
const ISSUE_DETAILS_MODAL_ID = 'lumine_issue_details_modal';
const ISSUE_UPLOAD_BUTTON_PREFIX = 'lumine_issue_upload:';
const ISSUE_SUBMIT_BUTTON_PREFIX = 'lumine_issue_submit:';
const ISSUE_UPLOAD_MODAL_PREFIX = 'lumine_issue_upload_modal:';
const ISSUE_TITLE_FIELD_ID = 'issue_title';
const ISSUE_DEVICE_FIELD_ID = 'issue_device';
const ISSUE_REALM_FIELD_ID = 'issue_realm';
const ISSUE_WHAT_HAPPENED_FIELD_ID = 'issue_what_happened';
const ISSUE_REPRODUCE_FIELD_ID = 'issue_reproduce';
const ISSUE_UPLOADS_FIELD_ID = 'issue_uploads';
const ISSUE_PANEL_FOOTER = 'Lumine Issue Intake Panel';
const PENDING_ISSUE_TTL_MS = 15 * 60 * 1000;
const IMAGE_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
    '.tiff',
    '.svg'
]);

class LumineIssuesIntake extends Base {
    private client: Client | null;
    private readonly config: IssuesIntakeConfig;
    private intakeMessageId: string | null;
    private pendingSubmissions: Map<string, PendingIssueSubmission>;

    constructor() {
        super('lumine_issues_intake', 'Creates a Lumine issue intake panel with modal submissions.');
        this.client = null;
        this.config = this.loadConfig();
        this.intakeMessageId = null;
        this.pendingSubmissions = new Map<string, PendingIssueSubmission>();

        this.registerEventHandler('clientReady', this.handleClientReady.bind(this));
        this.registerEventHandler('interactionCreate', this.handleInteractionCreate.bind(this));
        this.registerEventHandler('messageDelete', this.handleMessageDelete.bind(this));
    }

    private loadConfig(): IssuesIntakeConfig {
        return {
            guildId: process.env.ISSUES_GUILD_ID || process.env.MODERATED_GUILD_ID || DEFAULT_GUILD_ID,
            issuesChannelId: process.env.ISSUES_CHANNEL_ID || DEFAULT_ISSUES_CHANNEL_ID,
            issuePostChannelId: process.env.ISSUE_POST_CHANNEL_ID || DEFAULT_ISSUE_POST_CHANNEL_ID
        };
    }

    private async handleClientReady(client: Client): Promise<void> {
        this.client = client;
        await this.ensureIntakeMessage();
    }

    private async handleInteractionCreate(interaction: Interaction): Promise<void> {
        if (interaction.isButton()) {
            if (interaction.customId === ISSUE_PANEL_BUTTON_ID) {
                await this.handleIssueButton(interaction);
                return;
            }
            if (interaction.customId.startsWith(ISSUE_SUBMIT_BUTTON_PREFIX)) {
                await this.handlePendingSubmitButton(interaction);
                return;
            }
            if (interaction.customId.startsWith(ISSUE_UPLOAD_BUTTON_PREFIX)) {
                await this.handlePendingUploadButton(interaction);
                return;
            }
            return;
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === ISSUE_DETAILS_MODAL_ID) {
                await this.handleIssueDetailsModal(interaction);
                return;
            }
            if (interaction.customId.startsWith(ISSUE_UPLOAD_MODAL_PREFIX)) {
                await this.handleIssueUploadModal(interaction);
            }
        }
    }

    private async handleMessageDelete(message: Message | PartialMessage): Promise<void> {
        if (message.id !== this.intakeMessageId) {
            return;
        }
        if (message.channelId !== this.config.issuesChannelId) {
            return;
        }

        this.intakeMessageId = null;
        await this.ensureIntakeMessage();
    }

    private async ensureIntakeMessage(): Promise<void> {
        const issuesChannel = await this.fetchGuildTextChannel(this.config.issuesChannelId);
        if (!issuesChannel) {
            console.error('[LumineIssuesIntake] Issues channel not found or is not writable.');
            return;
        }

        const existingMessage = await this.findExistingIntakeMessage(issuesChannel);
        const payload = {
            embeds: [this.buildPanelEmbed()],
            components: [this.buildPanelComponents()]
        };

        if (existingMessage) {
            this.intakeMessageId = existingMessage.id;
            await existingMessage.edit(payload).catch(error => {
                console.error('[LumineIssuesIntake] Failed to refresh issue intake message:', error);
            });
            if (existingMessage.pinned) {
                await existingMessage.unpin('Issue intake panel should no longer be pinned.').catch(() => {});
            }
            return;
        }

        const sentMessage = await issuesChannel.send(payload).catch(error => {
            console.error('[LumineIssuesIntake] Failed to send issue intake message:', error);
            return null;
        });

        if (!sentMessage) {
            return;
        }

        this.intakeMessageId = sentMessage.id;
    }

    private async findExistingIntakeMessage(channel: GuildTextBasedChannel): Promise<Message | null> {
        const matchesPanelMessage = (message: Message): boolean => {
            if (!this.client || message.author.id !== this.client.user?.id) {
                return false;
            }

            const hasFooter = message.embeds.some(embed => embed.footer?.text === ISSUE_PANEL_FOOTER);
            const hasButton = message.components.some(component =>
                JSON.stringify(component.toJSON()).includes(ISSUE_PANEL_BUTTON_ID)
            );

            return hasFooter && hasButton;
        };

        const pinnedMessages = await channel.messages.fetchPinned().catch(() => null);
        const pinnedMatch = pinnedMessages?.find(matchesPanelMessage) ?? null;
        if (pinnedMatch) {
            return pinnedMatch;
        }

        const recentMessages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
        return recentMessages?.find(matchesPanelMessage) ?? null;
    }

    private buildPanelEmbed(): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle('Report a Lumine Issue')
            .setDescription(
                'Click **Report an Issue** to send a private issue report to the Lumine team.\n\n' +
                'The form will collect the details staff needs, and you can add optional uploads.'
            )
            .setColor(EMBED_COLOR_PRIMARY)
            .setFooter({ text: ISSUE_PANEL_FOOTER })
            .setTimestamp();
    }

    private buildPanelComponents(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(ISSUE_PANEL_BUTTON_ID)
                .setLabel('Report an Issue')
                .setStyle(ButtonStyle.Primary)
        );
    }

    private buildIssueDetailsModal(): ModalBuilder {
        const modal = new ModalBuilder()
            .setCustomId(ISSUE_DETAILS_MODAL_ID)
            .setTitle('Lumine Issue Report');

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(ISSUE_TITLE_FIELD_ID)
                    .setLabel('Short Title')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Example: Config import crashes')
                    .setRequired(true)
                    .setMinLength(3)
                    .setMaxLength(100)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(ISSUE_DEVICE_FIELD_ID)
                    .setLabel('Device')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Example: iPhone 15, Windows PC, Xbox')
                    .setRequired(true)
                    .setMinLength(2)
                    .setMaxLength(100)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(ISSUE_REALM_FIELD_ID)
                    .setLabel('Realm / Friend / Server IP')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Example: Realm, Friend world, play.example.net')
                    .setRequired(true)
                    .setMinLength(2)
                    .setMaxLength(150)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(ISSUE_WHAT_HAPPENED_FIELD_ID)
                    .setLabel('What happened')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Describe the issue.')
                    .setRequired(true)
                    .setMinLength(10)
                    .setMaxLength(1000)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(ISSUE_REPRODUCE_FIELD_ID)
                    .setLabel('Reproduce')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Step 1...\nStep 2...\nStep 3...')
                    .setRequired(false)
                    .setMaxLength(1000)
            )
        );

        return modal;
    }

    private buildUploadModal(sessionId: string): ModalBuilder {
        const modal = new ModalBuilder()
            .setCustomId(`${ISSUE_UPLOAD_MODAL_PREFIX}${sessionId}`)
            .setTitle('Add Issue Uploads');

        modal.addLabelComponents(
            new LabelBuilder()
                .setLabel('Uploads')
                .setDescription('Optional screenshots, videos, logs, or config files.')
                .setFileUploadComponent(
                    new FileUploadBuilder()
                        .setCustomId(ISSUE_UPLOADS_FIELD_ID)
                        .setRequired(false)
                        .setMaxValues(5)
                )
        );

        return modal;
    }

    private buildPendingSubmissionEmbed(submission: IssueSubmission): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle('Issue Ready to Submit')
            .setDescription('Click **Submit Report** to send it now, or **Add Uploads** to attach files first.')
            .addFields(
                { name: 'Short Title', value: this.truncateText(submission.title, 256), inline: false },
                { name: 'Device', value: this.truncateText(submission.device, 256), inline: true },
                { name: 'Realm / Friend / Server IP', value: this.truncateText(submission.realmOrServer, 256), inline: true },
                { name: 'What happened', value: this.truncateText(submission.whatHappened, 1024), inline: false },
                {
                    name: 'Reproduce',
                    value: submission.reproduce.length > 0 ? this.truncateText(submission.reproduce, 1024) : 'Not provided.',
                    inline: false
                }
            )
            .setColor(EMBED_COLOR_PRIMARY)
            .setTimestamp();
    }

    private buildPendingSubmissionComponents(sessionId: string): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`${ISSUE_SUBMIT_BUTTON_PREFIX}${sessionId}`)
                .setLabel('Submit Report')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`${ISSUE_UPLOAD_BUTTON_PREFIX}${sessionId}`)
                .setLabel('Add Uploads')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    private async handleIssueButton(interaction: ButtonInteraction): Promise<void> {
        if (!interaction.inGuild() || interaction.guildId !== this.config.guildId) {
            await interaction.reply({
                content: 'This issue form is only available inside the Lumine server.',
                flags: 64
            }).catch(() => {});
            return;
        }

        await interaction.showModal(this.buildIssueDetailsModal()).catch(error => {
            console.error('[LumineIssuesIntake] Failed to open issue modal:', error);
        });
    }

    private async handleIssueDetailsModal(interaction: ModalSubmitInteraction): Promise<void> {
        if (!interaction.inGuild() || interaction.guildId !== this.config.guildId) {
            await interaction.reply({
                content: 'This issue form is only available inside the Lumine server.',
                flags: 64
            }).catch(() => {});
            return;
        }

        this.sweepPendingSubmissions();
        const sessionId = randomUUID();
        const referenceId = randomUUID();
        const submission = this.readDetailsSubmission(interaction);

        this.pendingSubmissions.set(sessionId, {
            userId: interaction.user.id,
            createdAt: Date.now(),
            referenceId,
            submission
        });

        await interaction.reply({
            embeds: [this.buildPendingSubmissionEmbed(submission)],
            components: [this.buildPendingSubmissionComponents(sessionId)],
            flags: 64
        }).catch(error => {
            console.error('[LumineIssuesIntake] Failed to reply with pending issue buttons:', error);
        });
    }

    private async handlePendingSubmitButton(interaction: ButtonInteraction): Promise<void> {
        const sessionId = interaction.customId.slice(ISSUE_SUBMIT_BUTTON_PREFIX.length);
        const pending = this.getPendingSubmission(sessionId, interaction.user.id);
        if (!pending) {
            await interaction.reply({
                content: 'This issue draft expired. Please start again.',
                flags: 64
            }).catch(() => {});
            return;
        }

        const processingEmbed = new EmbedBuilder()
            .setTitle('Submitting Issue...')
            .setColor(EMBED_COLOR_PRIMARY)
            .setTimestamp();
        await interaction.update({ embeds: [processingEmbed], components: [] }).catch(() => {});

        const confirmationEmbed = await this.submitPendingIssue(interaction.user.id, pending);
        if (!confirmationEmbed) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('Could Not Submit Issue')
                .setDescription('I could not submit your issue right now. Please try again in a moment.')
                .setColor(EMBED_COLOR_ERROR)
                .setTimestamp();
            await interaction.editReply({
                embeds: [errorEmbed],
                components: [this.buildPendingSubmissionComponents(sessionId)]
            }).catch(() => {});
            return;
        }

        this.pendingSubmissions.delete(sessionId);
        await interaction.editReply({ embeds: [confirmationEmbed], components: [] }).catch(() => {});
    }

    private async handlePendingUploadButton(interaction: ButtonInteraction): Promise<void> {
        const sessionId = interaction.customId.slice(ISSUE_UPLOAD_BUTTON_PREFIX.length);
        const pending = this.getPendingSubmission(sessionId, interaction.user.id);
        if (!pending) {
            await interaction.reply({
                content: 'This issue draft expired. Please start again.',
                flags: 64
            }).catch(() => {});
            return;
        }

        await interaction.showModal(this.buildUploadModal(sessionId)).catch(error => {
            console.error('[LumineIssuesIntake] Failed to open upload modal:', error);
        });
    }

    private async handleIssueUploadModal(interaction: ModalSubmitInteraction): Promise<void> {
        const sessionId = interaction.customId.slice(ISSUE_UPLOAD_MODAL_PREFIX.length);
        const pending = this.getPendingSubmission(sessionId, interaction.user.id);
        if (!pending) {
            await interaction.reply({
                content: 'This issue draft expired. Please start again.',
                flags: 64
            }).catch(() => {});
            return;
        }

        pending.submission.uploads = Array.from(interaction.fields.getUploadedFiles(ISSUE_UPLOADS_FIELD_ID)?.values() ?? []);
        await interaction.deferReply({ flags: 64 });

        const confirmationEmbed = await this.submitPendingIssue(interaction.user.id, pending);
        if (!confirmationEmbed) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('Could Not Submit Issue')
                .setDescription('I could not submit your issue right now. Please try again in a moment.')
                .setColor(EMBED_COLOR_ERROR)
                .setTimestamp();
            await interaction.editReply({ embeds: [errorEmbed] }).catch(() => {});
            return;
        }

        this.pendingSubmissions.delete(sessionId);
        await interaction.editReply({ embeds: [confirmationEmbed] }).catch(() => {});
    }

    private readDetailsSubmission(interaction: ModalSubmitInteraction): IssueSubmission {
        return {
            title: interaction.fields.getTextInputValue(ISSUE_TITLE_FIELD_ID).trim(),
            device: interaction.fields.getTextInputValue(ISSUE_DEVICE_FIELD_ID).trim(),
            realmOrServer: interaction.fields.getTextInputValue(ISSUE_REALM_FIELD_ID).trim(),
            whatHappened: interaction.fields.getTextInputValue(ISSUE_WHAT_HAPPENED_FIELD_ID).trim(),
            reproduce: interaction.fields.getTextInputValue(ISSUE_REPRODUCE_FIELD_ID).trim(),
            uploads: []
        };
    }

    private async submitPendingIssue(
        userId: string,
        pending: PendingIssueSubmission
    ): Promise<EmbedBuilder | null> {
        const postChannel = await this.fetchGuildTextChannel(this.config.issuePostChannelId);
        if (!postChannel || !this.client) {
            return null;
        }

        const user = await this.client.users.fetch(userId).catch(() => null);
        if (!user) {
            return null;
        }

        const postedMessage = await postChannel.send({
            content: this.buildStaffReportContent(user.id, user.tag, pending.submission, pending.referenceId)
        }).catch(error => {
            console.error('[LumineIssuesIntake] Failed to post issue report:', error);
            return null;
        });

        if (!postedMessage) {
            return null;
        }

        return new EmbedBuilder()
            .setTitle('Issue Submitted')
            .setDescription(
                'Your Lumine issue report has been sent to the team.\n\n' +
                `Reference ID: \`${pending.referenceId}\``
            )
            .setColor(EMBED_COLOR_PRIMARY)
            .setTimestamp();
    }

    private buildStaffReportContent(
        userId: string,
        userTag: string,
        submission: IssueSubmission,
        referenceId: string
    ): string {
        const lines = [
            '**New Lumine issue report**',
            `**Reference ID:** \`${referenceId}\``,
            `**Reporter:** <@${userId}> (\`${this.escapeInlineCode(userTag)}\`)`,
            `**Device:** ${this.formatInlineValue(submission.device, 90)}`,
            `**Realm / Friend / Server IP:** ${this.formatInlineValue(submission.realmOrServer, 120)}`,
            '',
            '**Short Title**',
            this.formatCodeBlock(submission.title, 140),
            '',
            '**What happened**',
            this.formatCodeBlock(submission.whatHappened, 650),
            '',
            '**Reproduce**',
            this.formatCodeBlock(submission.reproduce.length > 0 ? submission.reproduce : 'Not provided.', 350),
            '',
            '**Uploads**'
        ];

        if (submission.uploads.length > 0) {
            lines.push(...submission.uploads.map(upload => (
                `- [${this.escapeLinkLabel(this.formatUploadLabel(upload))}](${upload.url})`
            )));
        } else {
            lines.push('Not provided.');
        }

        return this.chunkLines(lines, 1900)[0];
    }

    private chunkLines(lines: string[], maxLength: number): string[] {
        const chunks: string[] = [];
        let currentChunk = '';

        for (const line of lines) {
            const candidate = currentChunk.length > 0 ? `${currentChunk}\n${line}` : line;
            if (candidate.length <= maxLength) {
                currentChunk = candidate;
                continue;
            }

            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
            }
            currentChunk = line;
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    private getPendingSubmission(sessionId: string, userId: string): PendingIssueSubmission | null {
        this.sweepPendingSubmissions();
        const pending = this.pendingSubmissions.get(sessionId);
        if (!pending || pending.userId !== userId) {
            return null;
        }
        return pending;
    }

    private sweepPendingSubmissions(): void {
        const now = Date.now();
        for (const [sessionId, pending] of this.pendingSubmissions.entries()) {
            if (now - pending.createdAt > PENDING_ISSUE_TTL_MS) {
                this.pendingSubmissions.delete(sessionId);
            }
        }
    }

    private isImageAttachment(attachment: Attachment): boolean {
        const contentType = attachment.contentType?.toLowerCase() ?? '';
        if (contentType.startsWith('image/')) {
            return true;
        }

        const name = attachment.name?.toLowerCase() ?? '';
        return Array.from(IMAGE_EXTENSIONS).some(extension => name.endsWith(extension));
    }

    private formatUploadLabel(upload: Attachment): string {
        return `${this.truncateText(upload.name ?? upload.id, 60)} (${this.formatBytes(upload.size)})`;
    }

    private formatBytes(bytes: number): string {
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    private truncateText(content: string, maxLength: number): string {
        if (content.length <= maxLength) {
            return content;
        }
        return `${content.slice(0, Math.max(0, maxLength - 3))}...`;
    }

    private formatCodeBlock(content: string, maxLength: number): string {
        const sanitized = this.truncateText(this.escapeCodeBlockContent(content), maxLength);
        return `\`\`\`text\n${sanitized}\n\`\`\``;
    }

    private escapeCodeBlockContent(content: string): string {
        return content.replace(/```/g, '``\u200b`');
    }

    private escapeInlineCode(content: string): string {
        return content.replace(/`/g, '\\`');
    }

    private formatInlineValue(content: string, maxLength: number): string {
        return `\`${this.escapeInlineCode(this.truncateText(content, maxLength))}\``;
    }

    private escapeLinkLabel(content: string): string {
        return content.replace(/[[\]]/g, '\\$&');
    }

    private async fetchGuildTextChannel(channelId: string): Promise<GuildTextBasedChannel | null> {
        if (!this.client) {
            return null;
        }

        const channel = await this.client.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased() || channel.isDMBased()) {
            return null;
        }

        return channel as GuildTextBasedChannel;
    }
}

export = LumineIssuesIntake;
