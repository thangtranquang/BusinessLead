import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCampaignDto } from "./dto/create-campaign.dto";
import { UpdateCampaignDto } from "./dto/update-campaign.dto";
import { DEFAULT_OUTPUT_LANGUAGE, OUTPUT_LANGUAGES, type OutputLanguage } from "../common/language";

const DEFAULT_WORKSPACE_ID = "default-workspace";

/** The fields a PATCH may change: nothing else (workspace, status, progress, counters) is ever taken from a request body. */
const EDITABLE = ["name", "industry", "location", "searchQueries", "yourService", "description", "maxResults", "contentStyle"] as const;

/**
 * The DTOs already refuse anything but the two languages (FR-17); this repeats the check where the value is written, so a
 * caller that skipped validation still cannot store a value no reader understands. Omitted means "not given".
 */
function writableLanguage(value: unknown): OutputLanguage | undefined {
  if (value === undefined) return undefined;
  if (!(OUTPUT_LANGUAGES as readonly unknown[]).includes(value)) throw new BadRequestException("language is not supported");
  return value as OutputLanguage;
}

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService) {}

  async findAll(workspaceId = DEFAULT_WORKSPACE_ID) {
    return this.prisma.campaign.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { leads: true } } },
    });
  }

  async findOne(id: string, workspaceId = DEFAULT_WORKSPACE_ID) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, workspaceId },
      include: { _count: { select: { leads: true } } },
    });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);
    return campaign;
  }

  async create(dto: CreateCampaignDto, workspaceId = DEFAULT_WORKSPACE_ID) {
    await this.prisma.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, name: "Default Workspace", slug: "default" },
      update: {},
    });
    return this.prisma.campaign.create({
      data: {
        // listed one by one: a body can only ever set these fields, never the workspace, status or counters
        name: dto.name,
        industry: dto.industry,
        location: dto.location,
        searchQueries: dto.searchQueries,
        yourService: dto.yourService,
        description: dto.description,
        maxResults: dto.maxResults ?? 20,
        contentStyle: dto.contentStyle ?? "balanced",
        language: writableLanguage(dto.language) ?? DEFAULT_OUTPUT_LANGUAGE,
        workspaceId,
      },
    });
  }

  /**
   * The workspace id is required (no default) and is part of the write itself, so a campaign of another workspace is a 404,
   * indistinguishable from one that does not exist, and the check cannot be separated from the write.
   */
  async update(id: string, dto: UpdateCampaignDto, workspaceId: string) {
    const language = writableLanguage(dto.language);
    const data: Record<string, unknown> = {};
    for (const key of EDITABLE) if (dto[key] !== undefined) data[key] = dto[key];
    if (language !== undefined) data.language = language;
    const { count } = await this.prisma.campaign.updateMany({ where: { id, workspaceId }, data });
    if (count === 0) throw new NotFoundException(`Campaign ${id} not found`);
    return this.findOne(id, workspaceId);
  }

  async remove(id: string, workspaceId: string) {
    const { count } = await this.prisma.campaign.deleteMany({ where: { id, workspaceId } });
    if (count === 0) throw new NotFoundException(`Campaign ${id} not found`);
    return { id };
  }

  async updateStatus(id: string, status: string, progress?: number, error?: string) {
    return this.prisma.campaign.update({
      where: { id },
      data: {
        status,
        ...(progress !== undefined && { progress }),
        ...(error && { error }),
        ...(status === "running" && { startedAt: new Date() }),
        ...(status === "completed" && { completedAt: new Date() }),
      },
    });
  }

  async updateStats(id: string, stats: {
    totalLeads?: number;
    priorityLeads?: number;
    highQualityLeads?: number;
    averageScore?: number;
  }) {
    return this.prisma.campaign.update({ where: { id }, data: stats });
  }
}
