import Base = require('../../core/module/base');
import { Client, EmbedBuilder, TextBasedChannel } from 'discord.js';
import { Dirent, promises as fs } from 'fs';
import * as path from 'path';

type ContentSubmissionFormat = 'shortform' | 'longform';

type StoredContentSubmission = {
  id: string;
  createdAt: string;
  videoUrl: string;
  submitter: {
    contactEmail: string;
    accountEmail: string | null;
    discordHandle: string | null;
  };
  content: {
    format: ContentSubmissionFormat;
    about: string;
  };
  file: {
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  };
};

type ContentSubmissionQueueEvent = {
  kind: 'content-submission.created';
  createdAt: string;
  submissionId: string;
  submission: StoredContentSubmission;
};

const DEFAULT_CONTENT_SUBMISSIONS_CHANNEL_ID = '1492967643182010458';
const POLL_INTERVAL_MS = 15_000;
const CONTENT_SUBMISSION_EMBED_COLOR = 0x1f8f6b;

type WritableTextChannel = TextBasedChannel & {
  send: (options: { content?: string; embeds?: EmbedBuilder[] }) => Promise<unknown>;
};

class LumineContentSubmissions extends Base {
  private client: Client | null;
  private interval: NodeJS.Timeout | null;
  private processingQueue: boolean;
  private readonly channelId: string;
  private readonly storageRoot: string;

  constructor() {
    super('lumine_content_submissions', 'Posts new portal content submissions into the Lumine Discord review channel.');
    this.client = null;
    this.interval = null;
    this.processingQueue = false;
    this.channelId = process.env.CONTENT_SUBMISSIONS_CHANNEL_ID || DEFAULT_CONTENT_SUBMISSIONS_CHANNEL_ID;
    this.storageRoot = this.resolveStorageRoot();

    this.registerEventHandler('clientReady', this.handleClientReady.bind(this));
  }

  async cleanup(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private resolveStorageRoot(): string {
    const configured = process.env.LUMINE_CONTENT_SUBMISSIONS_DIR?.trim();
    if (configured) {
      return path.resolve(configured);
    }

    return path.resolve(process.cwd(), '..', '.data', 'content-submissions');
  }

  private getPendingQueueDir(): string {
    return path.join(this.storageRoot, 'queue', 'pending');
  }

  private getProcessedQueueDir(): string {
    return path.join(this.storageRoot, 'queue', 'processed');
  }

  private getFailedQueueDir(): string {
    return path.join(this.storageRoot, 'queue', 'failed');
  }

  private async ensureQueueDirs(): Promise<void> {
    await Promise.all([
      fs.mkdir(this.getPendingQueueDir(), { recursive: true }),
      fs.mkdir(this.getProcessedQueueDir(), { recursive: true }),
      fs.mkdir(this.getFailedQueueDir(), { recursive: true }),
    ]);
  }

  private async handleClientReady(client: Client): Promise<void> {
    this.client = client;
    await this.ensureQueueDirs();
    await this.processPendingQueue();

    this.interval = setInterval(() => {
      void this.processPendingQueue();
    }, POLL_INTERVAL_MS);

    console.info(`[ContentSubmissions] Watching ${this.getPendingQueueDir()} for new creator submissions.`);
  }

  private async processPendingQueue(): Promise<void> {
    if (this.processingQueue || !this.client) {
      return;
    }

    this.processingQueue = true;

    try {
      const entries = await fs.readdir(this.getPendingQueueDir(), { withFileTypes: true }).catch(() => [] as Dirent[]);
      const files = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));

      for (const fileName of files) {
        const pendingPath = path.join(this.getPendingQueueDir(), fileName);
        const event = await this.readQueueEvent(pendingPath);

        if (!event) {
          await this.moveQueueFile(pendingPath, this.getFailedQueueDir(), `invalid-${fileName}`);
          continue;
        }

        const channel = await this.fetchTargetChannel();
        if (!channel) {
          console.error(`[ContentSubmissions] Channel ${this.channelId} is not available.`);
          break;
        }

        try {
          await channel.send({
            embeds: [this.buildDiscordEmbed(event)],
          });
          await this.moveQueueFile(pendingPath, this.getProcessedQueueDir(), fileName);
        } catch (error) {
          console.error('[ContentSubmissions] Failed to post submission to Discord:', error);
          break;
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  private async readQueueEvent(queuePath: string): Promise<ContentSubmissionQueueEvent | null> {
    try {
      const raw = await fs.readFile(queuePath, 'utf8');
      const parsed = JSON.parse(raw) as ContentSubmissionQueueEvent;
      return this.isQueueEvent(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private isQueueEvent(value: ContentSubmissionQueueEvent | null | undefined): value is ContentSubmissionQueueEvent {
    if (!value || typeof value !== 'object') {
      return false;
    }

    return (
      value.kind === 'content-submission.created' &&
      typeof value.createdAt === 'string' &&
      typeof value.submissionId === 'string' &&
      Boolean(value.submission) &&
      typeof value.submission.videoUrl === 'string' &&
      typeof value.submission.submitter?.contactEmail === 'string' &&
      typeof value.submission.content?.format === 'string' &&
      typeof value.submission.content?.about === 'string'
    );
  }

  private async fetchTargetChannel(): Promise<WritableTextChannel | null> {
    if (!this.client) {
      return null;
    }

    const channel = await this.client.channels.fetch(this.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return null;
    }

    if (typeof (channel as WritableTextChannel).send !== 'function') {
      return null;
    }

    return channel as WritableTextChannel;
  }

  private formatContentType(value: ContentSubmissionFormat): string {
    return value === 'shortform' ? 'Short-form (YouTube Shorts)' : 'Long-form (YouTube Video)';
  }

  private formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
  }

  private truncateText(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength - 1).trimEnd()}…`;
  }

  private buildDiscordEmbed(event: ContentSubmissionQueueEvent): EmbedBuilder {
    const { submission } = event;
    const videoSummary = this.truncateText(submission.content.about, 600);
    const email = submission.submitter.accountEmail || submission.submitter.contactEmail;
    const footerParts = [
      submission.id,
      this.formatFileSize(submission.file.sizeBytes),
    ];

    const embed = new EmbedBuilder()
      .setColor(CONTENT_SUBMISSION_EMBED_COLOR)
      .setTitle('New Content Submission')
      .setURL(submission.videoUrl)
      .setDescription(videoSummary)
      .addFields(
        { name: 'Email', value: email || 'Unknown', inline: true },
        { name: 'Type', value: this.formatContentType(submission.content.format), inline: true },
      )
      .setFooter({ text: footerParts.join(' • ') })
      .setTimestamp(new Date(submission.createdAt));

    if (submission.submitter.discordHandle) {
      embed.addFields({
        name: 'Discord',
        value: this.truncateText(submission.submitter.discordHandle, 80),
        inline: true,
      });
    }

    return embed;
  }

  private async moveQueueFile(sourcePath: string, destinationDir: string, fileName: string): Promise<void> {
    await fs.mkdir(destinationDir, { recursive: true });
    const destinationPath = path.join(destinationDir, fileName);

    try {
      await fs.rename(sourcePath, destinationPath);
    } catch {
      const fallbackName = `${Date.now()}-${fileName}`;
      await fs.rename(sourcePath, path.join(destinationDir, fallbackName));
    }
  }
}

export = LumineContentSubmissions;
