using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Keytography.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUserSessionIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_UserSessions_AbsoluteExpiresAt",
                table: "UserSessions",
                column: "AbsoluteExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_UserSessions_IdleExpiresAt",
                table: "UserSessions",
                column: "IdleExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_UserSessions_RevokedAt",
                table: "UserSessions",
                column: "RevokedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_UserSessions_AbsoluteExpiresAt",
                table: "UserSessions");

            migrationBuilder.DropIndex(
                name: "IX_UserSessions_IdleExpiresAt",
                table: "UserSessions");

            migrationBuilder.DropIndex(
                name: "IX_UserSessions_RevokedAt",
                table: "UserSessions");
        }
    }
}
