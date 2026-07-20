import { describe, it, expect } from 'vitest';
import { scheduleCommand } from '../../src/commands/index';

describe('Bulk Command Registration', () => {
  const json = scheduleCommand.toJSON();

  // Discord.js option types: 1 = SUB_COMMAND, 2 = SUB_COMMAND_GROUP, 3 = STRING
  const SUB_COMMAND = 1;
  const STRING_OPTION = 3;

  const bulkSubcommand = json.options?.find(
    (opt: any) => opt.name === 'bulk' && opt.type === SUB_COMMAND
  );

  it('should have a "bulk" subcommand under /schedule (Req 1.1)', () => {
    expect(bulkSubcommand).toBeDefined();
    expect(bulkSubcommand!.type).toBe(SUB_COMMAND);
  });

  it('should have a required "entries" string option on the bulk subcommand (Req 1.2)', () => {
    const entriesOption = (bulkSubcommand as any)?.options?.find(
      (opt: any) => opt.name === 'entries'
    );

    expect(entriesOption).toBeDefined();
    expect(entriesOption.type).toBe(STRING_OPTION);
    expect(entriesOption.required).toBe(true);
  });

  it('should set maxLength of 6000 on the entries option (Req 1.2)', () => {
    const entriesOption = (bulkSubcommand as any)?.options?.find(
      (opt: any) => opt.name === 'entries'
    );

    expect(entriesOption).toBeDefined();
    expect(entriesOption.max_length).toBe(6000);
  });

  it('should have the correct description on the entries option (Req 1.2)', () => {
    const entriesOption = (bulkSubcommand as any)?.options?.find(
      (opt: any) => opt.name === 'entries'
    );

    expect(entriesOption).toBeDefined();
    expect(entriesOption.description).toBe(
      'Entries separated by | e.g. Monday 09:00 Stream | Friday 20:00 Games'
    );
  });
});
