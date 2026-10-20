ALTER TABLE posts ADD COLUMN video_url text;
ALTER TABLE posts ADD CONSTRAINT posts_video_url_length
  CHECK (video_url IS NULL OR char_length(video_url) <= 2048);
