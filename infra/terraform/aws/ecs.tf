resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
}

resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["api", "web", "worker", "voice-agent"])
  name              = "/ecs/${local.name}/${each.key}"
  retention_in_days = var.environment == "production" ? 30 : 14
}

resource "aws_iam_role" "execution" {
  name = "${local.name}-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.platform.arn, data.aws_secretsmanager_secret.providers.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [aws_kms_key.main.arn]
      }
    ]
  })
}

resource "aws_iam_role" "task" {
  name = "${local.name}-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "task" {
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [aws_s3_bucket.data.arn, "${aws_s3_bucket.data.arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"]
        Resource = [aws_kms_key.main.arn]
      }
    ]
  })
}

locals {
  services = {
    api = {
      cpu = 512, memory = 1024, port = 3001, desired = 2
      secrets = concat(local.platform_secrets, local.provider_secrets)
    }
    web = {
      cpu = 256, memory = 512, port = 3000, desired = 2
      secrets = []
    }
    worker = {
      cpu = 512, memory = 1024, port = 0, desired = 1
      secrets = concat(local.platform_secrets, local.provider_secrets)
    }
    voice-agent = {
      cpu = 1024, memory = 2048, port = 0, desired = 1
      secrets = local.provider_secrets
    }
  }
}

resource "aws_ecs_task_definition" "app" {
  for_each                 = local.services
  family                   = "${local.name}-${each.key}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
  container_definitions = jsonencode([{
    name      = each.key
    image     = "${aws_ecr_repository.app[each.key].repository_url}:${var.image_tag}"
    essential = true
    portMappings = each.value.port == 0 ? [] : [{ containerPort = each.value.port, hostPort = each.value.port, protocol = "tcp" }]
    environment = each.key == "web" ? [
      { name = "PORT", value = "3000" },
      { name = "HOSTNAME", value = "0.0.0.0" },
    ] : local.common_environment
    secrets = each.value.secrets
    readonlyRootFilesystem = true
    linuxParameters = { initProcessEnabled = true }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app[each.key].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = each.key
      }
    }
    healthCheck = each.key == "api" ? {
      command = ["CMD-SHELL", "node -e \"fetch('http://localhost:3001/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval = 30
      timeout = 5
      retries = 3
      startPeriod = 30
    } : null
  }])
}

resource "aws_ecs_service" "app" {
  for_each        = local.services
  name            = "${local.name}-${each.key}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app[each.key].arn
  desired_count   = each.value.desired
  launch_type     = "FARGATE"
  platform_version = "LATEST"
  enable_execute_command = true
  deployment_minimum_healthy_percent = each.key == "worker" || each.key == "voice-agent" ? 0 : 50
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = each.value.port == 0 ? null : 60
  network_configuration {
    subnets          = values(aws_subnet.private)[*].id
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = false
  }
  dynamic "load_balancer" {
    for_each = each.key == "api" || each.key == "web" ? [each.key] : []
    content {
      target_group_arn = each.key == "api" ? aws_lb_target_group.api.arn : aws_lb_target_group.web.arn
      container_name   = each.key
      container_port   = each.value.port
    }
  }
  lifecycle { ignore_changes = [desired_count] }
  depends_on = [aws_lb_listener.http, aws_lb_listener_rule.api, aws_iam_role_policy.execution_secrets]
}

resource "aws_appautoscaling_target" "service" {
  for_each           = { for key, value in local.services : key => value if key == "api" || key == "web" }
  max_capacity       = each.key == "api" ? 8 : 4
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each           = aws_appautoscaling_target.service
  name               = "${local.name}-${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = each.value.resource_id
  scalable_dimension = each.value.scalable_dimension
  service_namespace  = each.value.service_namespace
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification { predefined_metric_type = "ECSServiceAverageCPUUtilization" }
    target_value       = 60
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
  }
}
