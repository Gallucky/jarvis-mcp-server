import { z } from "zod";

// A select query needs to be a string with at least one character
// and can contain parameters/arguments in an array including
// strings, numbers, and nulls. The parameters will be safely
// injected into the query.
export const DbQueryInputSchema = z
    .object({
        sql: z
            .string()
            .min(1)
            .describe("A SELECT query to run, e.g. 'SELECT * FROM tasks WHERE done = 0'"),
        params: z
            .array(z.union([z.string(), z.number(), z.null()]))
            .default([])
            .describe("Values to safely inject into the query, e.g. [42, 'hello']"),
    })
    .strict();
// Create the type from the query schema.
export type DbQueryInput = z.infer<typeof DbQueryInputSchema>;

// An execute query needs to be a string with at least one character
// and can contain parameters/arguments in an array including
// strings, numbers, and nulls. The parameters will be safely
// injected into the query.
// it most begin with the following keywords: INSERT, UPDATE, DELETE.
export const DbExecuteInputSchema = z
    .object({
        sql: z
            .string()
            .min(1)
            .describe("An INSERT, UPDATE, or DELETE statement")
            .regex(/^\s*(INSERT|UPDATE|DELETE)/i),
        params: z
            .array(z.union([z.string(), z.number(), z.null()]))
            .default([])
            .describe("Values to safely inject into the statement"),
    })
    .strict();
// Create the type from the execute schema.
export type DbExecuteInput = z.infer<typeof DbExecuteInputSchema>;

// A describe table input needs to be a string with at least one character
// it will be strict and the input should be a name of a table in the database.
// The output will be a description of the table's columns and their types.
export const DbDescribeTableInputSchema = z
    .object({
        table: z
            .string()
            .min(1)
            .describe("Table name to describe, e.g. 'tasks'"),
    })
    .strict();
// Create the type from the describe table schema.
export type DbDescribeTableInput = z.infer<typeof DbDescribeTableInputSchema>;