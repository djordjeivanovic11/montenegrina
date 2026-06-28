resource "random_password" "database" {
  length  = 32
  special = false
}

resource "random_password" "redis" {
  length  = 32
  special = false
}

resource "random_password" "session" {
  length  = 48
  special = false
}

resource "random_password" "internal" {
  length  = 48
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = values(aws_subnet.private)[*].id
}

resource "aws_db_parameter_group" "postgres" {
  name   = "${local.name}-postgres17"
  family = "postgres17"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

resource "aws_db_instance" "postgres" {
  identifier                     = local.name
  engine                         = "postgres"
  engine_version                 = "17"
  instance_class                 = var.db_instance_class
  allocated_storage              = 20
  max_allocated_storage          = 100
  storage_type                   = "gp3"
  storage_encrypted              = true
  kms_key_id                     = aws_kms_key.main.arn
  db_name                        = "montenegrina"
  username                       = "montenegrina"
  password                       = random_password.database.result
  port                           = 5432
  db_subnet_group_name           = aws_db_subnet_group.main.name
  parameter_group_name           = aws_db_parameter_group.postgres.name
  vpc_security_group_ids         = [aws_security_group.database.id]
  publicly_accessible            = false
  multi_az                       = var.environment == "production"
  backup_retention_period        = var.environment == "production" ? 14 : 7
  maintenance_window             = "sun:03:00-sun:04:00"
  backup_window                  = "01:00-02:00"
  auto_minor_version_upgrade     = true
  deletion_protection            = var.deletion_protection
  skip_final_snapshot            = true
  performance_insights_enabled   = true
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
}

resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = values(aws_subnet.private)[*].id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = local.name
  description                = "${local.name} queues, sessions, locks, and realtime state"
  node_type                  = var.redis_node_type
  port                       = 6379
  num_cache_clusters         = 1
  parameter_group_name       = "default.redis7"
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis.result
  automatic_failover_enabled = false
  snapshot_retention_limit   = var.environment == "production" ? 7 : 1
  apply_immediately          = true
}

resource "aws_secretsmanager_secret" "platform" {
  name                    = "${local.name}/platform"
  kms_key_id              = aws_kms_key.main.arn
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "platform" {
  secret_id = aws_secretsmanager_secret.platform.id
  secret_string = jsonencode({
    DATABASE_URL         = "postgresql://montenegrina:${random_password.database.result}@${aws_db_instance.postgres.address}:5432/montenegrina?sslmode=require"
    REDIS_URL            = "rediss://:${random_password.redis.result}@${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"
    SESSION_SECRET       = random_password.session.result
    INTERNAL_TOKEN_SECRET = random_password.internal.result
  })
}
