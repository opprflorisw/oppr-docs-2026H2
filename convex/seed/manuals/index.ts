// Registry of the wrapped supplier manuals (rendered to PDF by
// convex/seed/supplierPdfs.ts).
import type { SupplierManual } from "../builders"
import { manual as krauss } from "./ext_mnt_man_0001"
import { manual as vortex } from "./mix_mnt_man_0001"
import { manual as nordcut } from "./ext_mnt_man_0002"
import { manual as sonatek } from "./qcl_qa_man_0001"

export const SEED_MANUALS: SupplierManual[] = [krauss, vortex, nordcut, sonatek]
