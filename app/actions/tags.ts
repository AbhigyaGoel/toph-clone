'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok, toUserMessage, type ActionResult } from '@/lib/actionResult';
import { logger } from '@/lib/logger';
import { UNIQUE_VIOLATION } from '@/lib/referenceInput';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/viewer';
import type { Tag } from '@/lib/types';

/**
 * "Add Tag" on the expanded panel.
 *
 * Tags are per-organisation rows rather than free text on the log, for the same
 * reason activities are a lookup table: two people typing "Re-spray" and
 * "respray" should not create two categories. Picking an existing tag links it;
 * typing a new name creates the tag once and then links it, so the vocabulary
 * grows from use instead of needing an admin screen.
 */

const TAG_NAME_MAX = 40;

/** Ceiling on an organisation's tag vocabulary; see reference.ts for the rationale. */
const MAX_TAGS = 500;

/**
 * Tag names are user-authored and rendered back as chips, so the input is
 * constrained at the boundary: printable text, collapsed whitespace, no control
 * characters. React escapes on render, this keeps the stored value clean.
 */
const tagNameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(TAG_NAME_MAX)
      .regex(/^[\p{L}\p{N} '&/-]+$/u, 'Tag names use letters, numbers and spaces.')
  );

const addSchema = z.object({ logId: z.string().uuid(), name: tagNameSchema });
const removeSchema = z.object({ logId: z.string().uuid(), tagId: z.string().uuid() });

/**
 * Confirms the log belongs to the organisation before anything writes to it.
 *
 * `getSupabaseAdmin` bypasses Row Level Security, so the tenant boundary the
 * read path gets from `.eq('org_id', ...)` has to be re-established by hand
 * here. Log ids appear in the page's URLs and a Server Action is an ordinary
 * endpoint, so "the UI would never send that id" is not a control.
 */
async function ownsLog(orgId: string, logId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from('activity_logs')
    .select('id')
    .eq('id', logId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    logger.error('ownsLog', error.message);
    return false;
  }

  return data !== null;
}

/** Deliberately identical for "not yours" and "does not exist" — see below. */
const NOT_FOUND = 'That log could not be found.';

/** Adds a tag to a log, creating the tag for the organisation if it is new. */
export async function addTagToLog(logId: string, name: string): Promise<ActionResult<Tag>> {
  const parsed = addSchema.safeParse({ logId, name });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'That tag name is not valid.');
  }


  try {
    const supabase = getSupabaseAdmin();
    const { viewer, denial } = await requirePermission('logs:write');
    if (denial) return denial;
    const { organization } = viewer;

    // The tag upsert below is org-scoped, but linking it to a log is not — so
    // the log's ownership is checked first. The message does not distinguish
    // "not yours" from "does not exist", which would otherwise let a caller
    // probe which log ids are real.
    if (!(await ownsLog(organization.id, parsed.data.logId))) {
      return fail(NOT_FOUND);
    }

    // `upsert` on the (org_id, name) unique key makes "find or create" one
    // round trip and closes the race between two people adding the same tag.
    const { data: tag, error: tagError } = await supabase
      .from('tags')
      .upsert(
        { org_id: organization.id, name: parsed.data.name },
        { onConflict: 'org_id,name', ignoreDuplicates: false }
      )
      .select('id, name')
      .single();

    if (tagError || !tag) {
      logger.error('addTagToLog:upsertTag', tagError?.message ?? 'no row returned');
      return fail('That tag could not be saved. Try again.');
    }

    const { error: linkError } = await supabase
      .from('log_tags')
      .upsert({ log_id: parsed.data.logId, tag_id: tag.id }, { onConflict: 'log_id,tag_id' });

    if (linkError) {
      logger.error('addTagToLog:link', linkError.message);
      return fail('That tag could not be attached to this log. Try again.');
    }

    revalidatePath('/', 'layout');

    return ok({ id: tag.id, name: tag.name });
  } catch (error: unknown) {
    logger.error('addTagToLog', error);
    return fail(toUserMessage(error, 'That tag could not be saved. Try again.'));
  }
}

/** Detaches a tag from a log. The tag itself stays in the organisation's set. */
export async function removeTagFromLog(
  logId: string,
  tagId: string
): Promise<ActionResult<{ readonly tagId: string }>> {
  const parsed = removeSchema.safeParse({ logId, tagId });
  if (!parsed.success) {
    return fail('That tag could not be removed — the request was not valid.');
  }


  try {
    const { viewer, denial } = await requirePermission('logs:write');
    if (denial) return denial;
    const { organization } = viewer;

    if (!(await ownsLog(organization.id, parsed.data.logId))) {
      return fail(NOT_FOUND);
    }

    const { error } = await getSupabaseAdmin()
      .from('log_tags')
      .delete()
      .eq('log_id', parsed.data.logId)
      .eq('tag_id', parsed.data.tagId);

    if (error) {
      logger.error('removeTagFromLog', error.message);
      return fail('That tag could not be removed. Try again.');
    }

    revalidatePath('/', 'layout');

    return ok({ tagId: parsed.data.tagId });
  } catch (error: unknown) {
    logger.error('removeTagFromLog', error);
    return fail(toUserMessage(error, 'That tag could not be removed. Try again.'));
  }
}

/**
 * Renames a tag everywhere it is attached.
 *
 * Renaming rather than deleting and re-adding is the whole reason tags are rows
 * with ids instead of strings on the log: fixing a typo in "Chemcial applied"
 * updates every log carrying it, and none of them lose the association.
 */
export async function renameTag(tagId: string, name: string): Promise<ActionResult<Tag>> {
  const parsedId = z.string().uuid().safeParse(tagId);
  const parsed = tagNameSchema.safeParse(name);

  if (!parsedId.success) return fail('That tag could not be found.');
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'That tag name is not valid.');

  try {
    const { viewer, denial } = await requirePermission('reference:write');
    if (denial) return denial;
    const { organization } = viewer;

    const { data, error } = await getSupabaseAdmin()
      .from('tags')
      .update({ name: parsed.data })
      .eq('id', parsedId.data)
      .eq('org_id', organization.id)
      .select('id, name')
      .maybeSingle();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return fail('Another tag already has that name.');
      logger.error('renameTag', error.message);
      return fail('That tag could not be renamed. Try again.');
    }
    if (!data) return fail('That tag could not be found.');

    revalidatePath('/', 'layout');
    return ok({ id: data.id, name: data.name });
  } catch (error: unknown) {
    logger.error('renameTag', error);
    return fail(toUserMessage(error, 'That tag could not be renamed. Try again.'));
  }
}

/**
 * Deletes a tag from the organisation's vocabulary.
 *
 * Unlike the other reference collections this cascades: `log_tags.tag_id` is
 * `on delete cascade`, so the tag detaches from every log rather than the
 * delete being refused. That asymmetry is intentional — a tag is an annotation,
 * and losing one costs a label; a field or an activity is part of what the log
 * *says*, and losing one would leave the log meaningless.
 */
export async function deleteTag(tagId: string): Promise<ActionResult<{ id: string }>> {
  const parsedId = z.string().uuid().safeParse(tagId);
  if (!parsedId.success) return fail('That tag could not be found.');

  try {
    const { viewer, denial } = await requirePermission('reference:delete');
    if (denial) return denial;
    const { organization } = viewer;

    const { data, error } = await getSupabaseAdmin()
      .from('tags')
      .delete()
      .eq('id', parsedId.data)
      .eq('org_id', organization.id)
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error('deleteTag', error.message);
      return fail('That tag could not be deleted. Try again.');
    }
    if (!data) return fail('That tag could not be found.');

    revalidatePath('/', 'layout');
    return ok({ id: data.id });
  } catch (error: unknown) {
    logger.error('deleteTag', error);
    return fail(toUserMessage(error, 'That tag could not be deleted. Try again.'));
  }
}

/** Creates a tag without attaching it, for the management screen. */
export async function createTag(name: string): Promise<ActionResult<Tag>> {
  const parsed = tagNameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'That tag name is not valid.');

  try {
    const { viewer, denial } = await requirePermission('reference:write');
    if (denial) return denial;
    const { organization } = viewer;

    const { count, error: countError } = await getSupabaseAdmin()
      .from('tags')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', organization.id);

    if (countError) {
      logger.error('createTag:count', countError.message);
      return fail('That tag could not be created. Try again.');
    }
    if ((count ?? 0) >= MAX_TAGS) return fail('This farm already has the maximum number of tags.');

    const { data, error } = await getSupabaseAdmin()
      .from('tags')
      .insert({ org_id: organization.id, name: parsed.data })
      .select('id, name')
      .single();

    if (error || !data) {
      if (error?.code === UNIQUE_VIOLATION) return fail('That tag already exists.');
      logger.error('createTag', error?.message ?? 'no row returned');
      return fail('That tag could not be created. Try again.');
    }

    revalidatePath('/', 'layout');
    return ok({ id: data.id, name: data.name });
  } catch (error: unknown) {
    logger.error('createTag', error);
    return fail(toUserMessage(error, 'That tag could not be created. Try again.'));
  }
}
