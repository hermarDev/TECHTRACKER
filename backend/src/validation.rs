use serde::Deserialize;
use validator::Validate;

#[derive(Debug, Deserialize, Validate)]
pub struct RegisterInput {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 8))]
    pub password: String,
    #[validate(length(min = 1))]
    pub full_name: String,
    #[validate(length(min = 1))]
    pub student_id_no: String,
    #[validate(length(min = 1))]
    pub program: String,
    #[validate(length(min = 1))]
    pub section: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct LoginInput {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 1))]
    pub password: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct ForgotPasswordInput {
    #[validate(email)]
    pub email: String,
}
