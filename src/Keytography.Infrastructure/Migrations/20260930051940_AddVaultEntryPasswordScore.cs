using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Keytography.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddVaultEntryPasswordScore : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "PasswordScore",
                table: "VaultEntries",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PasswordScoreDetailJson",
                table: "VaultEntries",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PasswordScore",
                table: "VaultEntries");

            migrationBuilder.DropColumn(
                name: "PasswordScoreDetailJson",
                table: "VaultEntries");
        }
    }
}
