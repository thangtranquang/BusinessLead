import { OmitType, PartialType } from "@nestjs/swagger";
import { CreateCampaignDto } from "./create-campaign.dto";
import { IsOutputLanguage, type OutputLanguage } from "../../common/language";
import { IsMarket, type Market } from "../../common/market";

/**
 * PartialType adds @IsOptional() to every field, and @IsOptional() skips all validators for null, so a plain
 * PartialType(CreateCampaignDto) would let `language: null` through to the database (a 500). The language is therefore
 * left out and declared again with the shared decorator, which only skips `undefined` (FR-48).
 */
export class UpdateCampaignDto extends PartialType(OmitType(CreateCampaignDto, ["language", "market"] as const)) {
  @IsOutputLanguage() language?: OutputLanguage;
  /** Same reason as the language: PartialType would let `market: null` through. */
  @IsMarket() market?: Market;
}
