/** 出参结构：楼层 / 主题 / 作者 */

export function serializeThread(row, actorKey) {
  return {
    id: row.id,
    board_id: row.board_id,
    board_slug: row.board_slug,
    board_name: row.board_name,
    title: row.title,
    excerpt: row.excerpt ?? '',
    author: {
      name: row.author_name,
      type: row.author_type,
      user_id: row.author_id ?? null,
      is_me: !!row.actor_key && row.actor_key === actorKey,
    },
    pinned: !!row.pinned,
    locked: !!row.locked,
    views: row.views,
    floor_count: row.floor_count,
    reply_count: row.reply_count,
    last_reply_at: row.last_reply_at,
    created_at: row.created_at,
  };
}

export function serializePost(row, actorKey, { replies = [], opKey = null, isAdmin = false } = {}) {
  const mine = !!row.actor_key && row.actor_key === actorKey;
  return {
    id: row.id,
    thread_id: row.thread_id,
    floor_no: row.floor_no,
    parent_id: row.parent_id ?? null,
    quote:
      row.quote_floor_no != null
        ? { floor_no: row.quote_floor_no, author: row.quote_author ?? '' }
        : null,
    author: {
      name: row.author_name,
      type: row.author_type,
      user_id: row.author_id ?? null,
      is_me: mine,
      is_admin: row.author_role === 'admin',
      is_op: opKey != null && row.actor_key === opKey,
      avatar: row.author_avatar ?? '',
      bio: row.author_bio ?? '',
    },
    content: row.deleted ? '' : row.content,
    likes: row.likes,
    liked: !!row.liked,
    deleted: !!row.deleted,
    can_delete: !row.deleted && (mine || isAdmin),
    created_at: row.created_at,
    updated_at: row.updated_at,
    replies: replies.map((r) => serializePost(r, actorKey, { opKey, isAdmin })),
  };
}
