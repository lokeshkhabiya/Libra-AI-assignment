import { Router } from "express";

import {
	callbackDriveController,
	connectDriveController,
	disconnectDriveController,
	driveStatusController,
	listDriveFilesController,
	syncDriveController,
} from "@/controllers/drive.controller";
import { requireAuth } from "@/middleware/auth";

const driveRouter: Router = Router();

driveRouter.get("/connect", requireAuth, connectDriveController);
driveRouter.get("/callback", requireAuth, callbackDriveController);
driveRouter.get("/status", requireAuth, driveStatusController);
driveRouter.post("/sync", requireAuth, syncDriveController);
driveRouter.get("/files", requireAuth, listDriveFilesController);
driveRouter.delete("/disconnect", requireAuth, disconnectDriveController);

export default driveRouter;
