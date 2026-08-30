import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runTerminalCommand } from "./terminal.server";

const CommandInput = z.object({ command: z.string().min(1).max(500) });

export const execTerminalCommand = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CommandInput.parse(input))
  .handler(async ({ data }) => runTerminalCommand(data.command));
