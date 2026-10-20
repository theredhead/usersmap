export const memberProjection = `
  jsonb_build_object(
    'id', m.id, 'nickname', m.nickname, 'punchline', m.punchline, 'bio', m.bio,
    'avatarUrl', CASE WHEN m.avatar_id IS NULL THEN NULL ELSE '/api/media/' || m.avatar_id END,
    'customAnswers', m.custom_answers,
    'lastCheckinAt', (SELECT updated_at FROM locations WHERE member_id = m.id AND kind = 'checkin'),
    'location', (
      SELECT jsonb_build_object('kind', kind, 'lat', latitude, 'lng', longitude,
        'radiusKm', radius_km, 'comment', comment, 'updatedAt', updated_at)
      FROM locations WHERE member_id = m.id
      ORDER BY CASE kind WHEN 'checkin' THEN 0 WHEN 'home' THEN 1 ELSE 2 END LIMIT 1
    )
  )`;
