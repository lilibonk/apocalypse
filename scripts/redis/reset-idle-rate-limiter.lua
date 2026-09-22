-- Controlled maintenance only: stop all callers and drain max(old, new) window first.
-- KEYS: limiter config, {config}:value, {config}:permits. ARGV[1]: new window in ms.
-- Redisson 4.7.0 OVERALL format. Never use this for a live rolling configuration change.
if #KEYS ~= 3 or #ARGV ~= 1 then
  return redis.error_reply('Expected three limiter keys and the new window in milliseconds')
end
local name = KEYS[1]
if not string.match(name, '^apoc:rl:.+:.+$') or string.find(name, '[{}]')
    or KEYS[2] ~= '{' .. name .. '}:value'
    or KEYS[3] ~= '{' .. name .. '}:permits' then
  return redis.error_reply('Limiter key ownership mismatch')
end
local newWindow = tonumber(ARGV[1])
if not newWindow or newWindow < 1 or newWindow ~= math.floor(newWindow) then
  return redis.error_reply('New window must be a positive integer')
end
if redis.call('EXISTS', name) == 0 then
  if redis.call('EXISTS', KEYS[2], KEYS[3]) ~= 0 then
    return redis.error_reply('Orphan limiter state requires inspection')
  end
  return 0
end
local config = redis.call('HMGET', name, 'type', 'rate', 'interval')
local rate = tonumber(config[2])
local oldWindow = tonumber(config[3])
if config[1] ~= '0' or not rate or rate < 1 or not oldWindow or oldWindow < 1 then
  return redis.error_reply('Unsupported limiter configuration')
end
local last = redis.call('ZRANGE', KEYS[3], -1, -1, 'WITHSCORES')
if #last > 0 then
  local time = redis.call('TIME')
  local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
  if now - tonumber(last[2]) < math.max(oldWindow, newWindow) then
    return redis.error_reply('Limiter has recent permits; keep traffic drained')
  end
end
return redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
