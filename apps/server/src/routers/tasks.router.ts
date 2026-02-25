import { Router } from "express";

import {
	cancelTaskController,
	createTaskController,
	getTaskController,
	listTasksController,
	streamTaskController,
} from "@/controllers/tasks.controller";
import { requireAuth } from "@/middleware/auth";

const tasksRouter: Router = Router();

tasksRouter.post("/", requireAuth, createTaskController);
tasksRouter.get("/", requireAuth, listTasksController);
tasksRouter.get("/:id", requireAuth, getTaskController);
tasksRouter.get("/:id/stream", requireAuth, streamTaskController);
tasksRouter.post("/:id/cancel", requireAuth, cancelTaskController);

export default tasksRouter;
