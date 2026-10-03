import type { paths } from "../../api/schema";
export type SubscriptionResponse = paths["/api/owner/subscription"]["get"]["responses"][200]["content"]["application/json"];
export type ReportResponse = paths["/api/owner/reports"]["get"]["responses"][200]["content"]["application/json"];
export type CommercesResponse = paths["/api/admin/commerces"]["get"]["responses"][200]["content"]["application/json"];
export type AdminCommerce = CommercesResponse["commerces"][number];
