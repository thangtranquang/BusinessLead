import { IsString, IsArray, IsOptional, IsInt, Min, Max, MaxLength, ArrayMaxSize } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { IsOutputLanguage, type OutputLanguage } from "../../common/language";
import { IsMarket, type Market } from "../../common/market";

export class CreateCampaignDto {
  @ApiProperty() @IsString() @MaxLength(160) name: string;
  @ApiProperty() @IsString() @MaxLength(160) industry: string;
  @ApiProperty() @IsString() @MaxLength(200) location: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(200, { each: true }) searchQueries: string[];
  @ApiProperty() @IsString() @MaxLength(2000) yourService: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiProperty({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Max(2000) maxResults?: number;
  @ApiProperty({ default: "balanced" }) @IsOptional() @IsString() @MaxLength(30) contentStyle?: string;
  /** "vietnamese" | "english"; omitted means vietnamese. An explicit null or any other value is a 400 (FR-17). */
  @IsOutputLanguage() language?: OutputLanguage;
  /** "ID" | "VN"; omitted means ID. An explicit null or any other value is a 400. Changeable only while the campaign is a draft. */
  @IsMarket() market?: Market;
}
