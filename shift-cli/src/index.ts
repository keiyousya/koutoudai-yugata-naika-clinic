#!/usr/bin/env node
import { program } from "commander";
import { staffCommands } from "./commands/staff.js";
import { calendarCommands } from "./commands/calendar.js";
import { requestsCommands } from "./commands/requests.js";
import { periodCommands } from "./commands/period.js";
import { assignmentsCommands } from "./commands/assignments.js";
import { checkEnv } from "./api.js";

program
  .name("shift-cli")
  .description("勾当台夕方内科クリニック シフト管理CLI")
  .version("0.0.0")
  .hook("preAction", () => {
    checkEnv();
  });

program.addCommand(staffCommands);
program.addCommand(calendarCommands);
program.addCommand(requestsCommands);
program.addCommand(periodCommands);
program.addCommand(assignmentsCommands);

program.parse();
