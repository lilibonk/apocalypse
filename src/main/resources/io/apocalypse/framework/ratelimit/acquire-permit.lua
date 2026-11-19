-- Redisson 4.7 OVERALL layout. Keep in sync with the controlled idle reset script.
-- KEYS: config, value, permits; ARGV: expected rate, expected interval, unique permit ID.
local config = redis.call('HMGET', KEYS[1], 'type', 'rate', 'interval', 'keepAliveTime')
if not config[1] and redis.call('EXISTS', KEYS[1], KEYS[2], KEYS[3]) == 0 then
    return -2
end
if config[1] ~= '0' or config[2] ~= ARGV[1] or config[3] ~= ARGV[2] then
    return -1
end

local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local cutoff = now - tonumber(config[3])
local rate = tonumber(config[2])
local current = redis.call('GET', KEYS[2])
if not current and redis.call('EXISTS', KEYS[3]) ~= 0 then
    return -1
end
current = tonumber(current or rate)
local expired = redis.call('ZRANGEBYSCORE', KEYS[3], 0, cutoff)
if #expired > 0 then
    local released = 0
    for _, entry in ipairs(expired) do
        local _, permits = struct.unpack('Bc0I', entry)
        released = released + permits
    end
    redis.call('ZREMRANGEBYSCORE', KEYS[3], 0, cutoff)
    current = math.min(rate, current + released)
end
local acquired = 0
if current > 0 then
    local member = struct.pack('Bc0I', string.len(ARGV[3]), ARGV[3], 1)
    redis.call('ZADD', KEYS[3], now, member)
    current = current - 1
    acquired = 1
end
redis.call('SET', KEYS[2], current, 'KEEPTTL')

local keepAlive = tonumber(config[4])
if keepAlive and keepAlive > 0 then
    redis.call('PEXPIRE', KEYS[1], keepAlive)
else
    keepAlive = redis.call('PTTL', KEYS[1])
end
if keepAlive > 0 then
    redis.call('PEXPIRE', KEYS[2], keepAlive)
    redis.call('PEXPIRE', KEYS[3], keepAlive)
end
return acquired
