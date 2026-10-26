import { Module } from "@nestjs/common";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { EnrichmentService } from "./enrichment.service";
import { GeoService } from "./geo.service";
import { MarketingModule } from "../marketing/marketing.module";
import { AuthModule } from "../auth/auth.module";
import { AiModule } from "../ai/ai.module";
import { ReassessService } from "./reassess.service";

@Module({
  imports: [AuthModule, MarketingModule, AiModule],
  controllers: [LeadsController],
  providers: [LeadsService, EnrichmentService, GeoService, ReassessService],
  exports: [LeadsService, EnrichmentService, GeoService],
})
export class LeadsModule {}
