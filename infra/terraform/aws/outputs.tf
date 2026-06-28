output "application_url" {
  value       = "https://${aws_cloudfront_distribution.app.domain_name}"
  description = "Public HTTPS URL for web and API."
}

output "ecr_repositories" {
  value = { for name, repository in aws_ecr_repository.app : name => repository.repository_url }
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_names" {
  value = { for name, service in aws_ecs_service.app : name => service.name }
}

output "api_task_definition_arn" {
  value = aws_ecs_task_definition.app["api"].arn
}

output "private_subnet_ids" {
  value = values(aws_subnet.private)[*].id
}

output "task_security_group_id" {
  value = aws_security_group.tasks.id
}

output "data_bucket" {
  value = aws_s3_bucket.data.id
}
